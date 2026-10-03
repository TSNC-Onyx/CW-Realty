import "server-only";

import { fetchAssistantReply, type ChatTurn } from "@/lib/chat/answer-question";
import { getAssistantFailure } from "@/lib/chat/assistant-failure";
import { HANDOFF_TEXT, getHandoffReply, type AssistantReply } from "@/lib/chat/assistant-reply";
import { fetchChatTenantId, fetchIsAssistantOn, fetchOpenChatSession, fetchPublishedPolicy, isOverHourlyChatLimit, recordChatExchange, startChatSession, type ChatSession } from "@/lib/chat/chat-log";
import type { SendChatResult } from "@/lib/chat/chat-results";
import { CHAT_TURNSTILE_ACTION, MAX_VISITOR_MESSAGES_PER_CHAT, chatMessageSchema, type ChatMessageInput } from "@/lib/chat/chat-schemas";
import { getClaudeAnswerModel, type NoAnswerReason } from "@/lib/chat/claude-model";
import { getRedactedText } from "@/lib/chat/restricted-data";
import { reportVisitorProblem } from "@/lib/observability/report-visitor-problem";
import { isOutdatedBotCheckKey } from "@/lib/security/bot-check-key";
import { BOT_CHECK_MESSAGES } from "@/lib/security/bot-check-messages";
import { isOverChatLimit } from "@/lib/security/rate-limit";
import type { Visitor } from "@/lib/security/visitor";
import { passesVisitorBotCheck } from "@/lib/security/visitor-bot-check";

// One visitor question → one logged reply (Phase 5 plan, architecture context). Every reason
// a visitor isn't answered by the assistant is recorded (docs/cwr-reliability-round-plan.md §4).

// The model sees the latest turns only; the full chat stays in the log and the hand-off.
const HISTORY_TURN_LIMIT = 20;
const LIMITED_MESSAGE = "You're sending messages quickly. Wait a minute, then try again.";
const FULL_MESSAGE = "This chat has reached its length limit. Tap “Talk to a person” and our team will pick it up from here.";

type OpenedSession = { session: ChatSession } | { result: SendChatResult };

type NewSessionRequest = { question: string; turnstileToken: string; botCheckKey?: string; visitor: Visitor };

async function getOutdatedPageResult(): Promise<SendChatResult> {
  await reportVisitorProblem({ action: "site.chat_message", stage: "validate", severity: "warning", code: "outdated_page" });
  return { status: "error", message: BOT_CHECK_MESSAGES.outdatedRefreshButton, recovery: "refresh" };
}

async function getBusyResult(question: string): Promise<SendChatResult> {
  await reportVisitorProblem({ action: "site.chat_message", stage: "rule", severity: "warning", code: "hourly_cap", detail: "The site-wide hourly chat limit was reached; the visitor was offered a person." });
  return { status: "replied", sessionId: null, question: getRedactedText(question), reply: getHandoffReply(HANDOFF_TEXT.unavailable) };
}

async function openNewSession({ question, turnstileToken, botCheckKey, visitor }: NewSessionRequest): Promise<OpenedSession> {
  if (isOutdatedBotCheckKey(botCheckKey ?? null)) return { result: await getOutdatedPageResult() };
  const isHuman = await passesVisitorBotCheck({ token: turnstileToken, remoteIp: visitor.ip, expectedAction: CHAT_TURNSTILE_ACTION, expectedHostname: visitor.hostname });
  if (!isHuman) return { result: { status: "error", message: BOT_CHECK_MESSAGES.refused } };
  const tenantId = await fetchChatTenantId();
  if (await isOverHourlyChatLimit(tenantId)) return { result: await getBusyResult(question) };
  const policy = await fetchPublishedPolicy(tenantId);
  return { session: await startChatSession({ tenantId, policyId: policy?.id ?? null }) };
}

async function openSession({ sessionId, message, turnstileToken, botCheckKey, visitor }: { sessionId: string | null; message: string; turnstileToken: string; botCheckKey?: string; visitor: Visitor }): Promise<OpenedSession> {
  if (sessionId === null) return openNewSession({ question: message, turnstileToken, botCheckKey, visitor });
  const session = await fetchOpenChatSession(sessionId);
  return session ? { session } : { result: { status: "expired" } };
}

async function reportNoAnswer(reason: NoAnswerReason): Promise<void> {
  await reportVisitorProblem({ action: "site.chat_assistant", stage: "external", severity: "info", code: reason, detail: "Claude gave no usable answer; the visitor was offered a person." });
}

async function reportNotReady(code: "no_api_key" | "no_published_policy"): Promise<AssistantReply> {
  await reportVisitorProblem({ action: "site.chat_assistant", stage: "setup", severity: "warning", code, detail: "The assistant isn't set up; every visitor is offered a person." });
  return getHandoffReply(HANDOFF_TEXT.unavailable);
}

/** The model is an outside service: any failure becomes a hand-off, never a broken chat. */
async function fetchModelReply({ policyBody, turns }: { policyBody: string; turns: ChatTurn[] }): Promise<AssistantReply> {
  const model = getClaudeAnswerModel({ onNoAnswer: reportNoAnswer });
  if (!model) return reportNotReady("no_api_key");
  try {
    return await fetchAssistantReply({ policyBody, turns, model });
  } catch (error) {
    await reportVisitorProblem({ action: "site.chat_assistant", stage: "external", ...getAssistantFailure(error) });
    return getHandoffReply(HANDOFF_TEXT.unavailable);
  }
}

async function fetchReplyOrHandoff({ tenantId, turns }: { tenantId: string; turns: ChatTurn[] }): Promise<AssistantReply> {
  if (!(await fetchIsAssistantOn(tenantId))) return getHandoffReply(HANDOFF_TEXT.unavailable);
  const policy = await fetchPublishedPolicy(tenantId);
  if (!policy) return reportNotReady("no_published_policy");
  return fetchModelReply({ policyBody: policy.body, turns });
}

export async function sendChatMessage({ input, visitor }: { input: ChatMessageInput; visitor: Visitor }): Promise<SendChatResult> {
  const parsed = chatMessageSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Type a question first" };
  if (await isOverChatLimit(visitor.ip)) return { status: "error", message: LIMITED_MESSAGE };
  const opened = await openSession({ ...parsed.data, visitor });
  if ("result" in opened) return opened.result;
  const { session } = opened;
  if (session.visitorMessageCount >= MAX_VISITOR_MESSAGES_PER_CHAT) return { status: "error", message: FULL_MESSAGE };
  const question = parsed.data.message;
  const turns: ChatTurn[] = [...session.turns.slice(-HISTORY_TURN_LIMIT), { role: "visitor", body: question }];
  const reply = await fetchReplyOrHandoff({ tenantId: session.tenantId, turns });
  await recordChatExchange({ session, question, reply });
  return { status: "replied", sessionId: session.id, question: getRedactedText(question), reply };
}
