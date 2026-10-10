import "server-only";

import { fetchAssistantReply, getRepairedTurnReply, type ChatTurn } from "@/lib/chat/answer-question";
import { getAssistantFailure } from "@/lib/chat/assistant-failure";
import { HANDOFF_TEXT, getHandoffReply, type AssistantReply, type HandoffReason } from "@/lib/chat/assistant-reply";
import { fetchChatTenantId, fetchIsAssistantOn, fetchOpenChatSession, fetchPublishedPolicy, isOverHourlyChatLimit, markFirstQuestion, recordChatExchange, startChatSession, type ChatSession } from "@/lib/chat/chat-log";
import type { SendChatResult } from "@/lib/chat/chat-results";
import { CHAT_TURNSTILE_ACTION, MAX_VISITOR_MESSAGES_PER_CHAT, chatMessageSchema, type ChatMessageInput } from "@/lib/chat/chat-schemas";
import { getClaudeAnswerModel, type NoAnswerReason } from "@/lib/chat/claude-model";
import { getEmergencyReply, isEmergencyMessage } from "@/lib/chat/emergency";
import { getPublicSections } from "@/lib/chat/policy-sections";
import { getRedactedText, hasRestrictedNumber } from "@/lib/chat/restricted-data";
import { isFirstInThisCopy } from "@/lib/observability/once-per-copy";
import type { ProblemSeverity } from "@/lib/observability/problem-types";
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
const LIMITED_MESSAGE = "Thanks for your patience! You're sending messages a little quickly, so please wait a minute and try again.";
const FULL_MESSAGE = "We've covered a lot in this chat, and it has reached its length limit. Just tap “Talk to a person” and our team will be glad to pick it up from here.";
// Answers a server check turned into a hand-off (docs/cwr-chat-policy-test-batches-plan.md, Part B).
// The model's own hand-off (model_handoff) is normal and isn't recorded.
const RECORDED_REJECTIONS: Partial<Record<HandoffReason, ProblemSeverity>> = {
  empty_or_long: "info",
  bad_citation: "info",
  leaked_marker: "warning",
  unsafe_conversation: "warning",
  // Round 3: expected, harmless replacements, kept for the weekly review.
  lead_downgraded: "info",
  policy_fact_in_conversation: "info",
  slang_in_conversation: "info",
};
// How much of a rejected AI-written reply the problem log keeps, with ID numbers removed.
const MAX_REJECTED_DETAIL_LENGTH = 200;
const REJECTED_DETAIL = "The assistant's reply failed a server check; the visitor got an approved line instead.";
// The problem log never keeps contact details the reply may have echoed: digits and emails are masked.
const DIGIT_PATTERN = /\p{Nd}/gu;
const EMAIL_PATTERN = /\S+@\S+/g;

/** An emergency gets the fixed reply even when the assistant is off, busy or failing. Restricted numbers still come first. */
function isEmergencyQuestion(question: string): boolean {
  return isEmergencyMessage(question) && !hasRestrictedNumber(question);
}

type NotReadyCode = "no_api_key" | "no_published_policy";

type OpenedSession = { session: ChatSession } | { result: SendChatResult };

type NewSessionRequest = { question: string; turnstileToken: string; botCheckKey?: string; visitor: Visitor };

async function getOutdatedPageResult(): Promise<SendChatResult> {
  await reportVisitorProblem({ action: "site.chat_message", stage: "validate", severity: "warning", code: "outdated_page" });
  return { status: "error", message: BOT_CHECK_MESSAGES.outdatedRefreshButton, recovery: "refresh" };
}

async function getBusyResult(question: string): Promise<SendChatResult> {
  await reportVisitorProblem({ action: "site.chat_message", stage: "rule", severity: "warning", code: "hourly_cap", detail: "The site-wide hourly chat limit was reached; the visitor was offered a person." });
  const reply = isEmergencyQuestion(question) ? getEmergencyReply([]) : getHandoffReply(HANDOFF_TEXT.unavailable);
  return { status: "replied", sessionId: null, question: getRedactedText(question), reply };
}

/** The Quick Check before a chat's first typed question; null when it passes. */
async function getBotCheckFailure({ turnstileToken, botCheckKey, visitor }: Omit<NewSessionRequest, "question">): Promise<SendChatResult | null> {
  if (isOutdatedBotCheckKey(botCheckKey ?? null)) return getOutdatedPageResult();
  const isHuman = await passesVisitorBotCheck({ token: turnstileToken, remoteIp: visitor.ip, expectedAction: CHAT_TURNSTILE_ACTION, expectedHostname: visitor.hostname });
  return isHuman ? null : { status: "error", message: BOT_CHECK_MESSAGES.refused };
}

async function openNewSession({ question, turnstileToken, botCheckKey, visitor }: NewSessionRequest): Promise<OpenedSession> {
  const botCheckFailure = await getBotCheckFailure({ turnstileToken, botCheckKey, visitor });
  if (botCheckFailure) return { result: botCheckFailure };
  const tenantId = await fetchChatTenantId();
  if (await isOverHourlyChatLimit(tenantId)) return { result: await getBusyResult(question) };
  const policy = await fetchPublishedPolicy(tenantId);
  return { session: await startChatSession({ tenantId, policyId: policy?.id ?? null }) };
}

async function openSession({ sessionId, message, turnstileToken, botCheckKey, visitor }: { sessionId: string | null; message: string; turnstileToken: string; botCheckKey?: string; visitor: Visitor }): Promise<OpenedSession> {
  if (sessionId === null) return openNewSession({ question: message, turnstileToken, botCheckKey, visitor });
  const session = await fetchOpenChatSession(sessionId);
  if (!session) return { result: { status: "expired" } };
  // A chat started by topic buttons (no Quick Check, no AI) gets both checks a new chat gets
  // before its first typed question: the Quick Check and the hourly limit, which it joins now
  // (docs/cwr-chat-guided-options-plan.md §12).
  if (session.typedQuestionCount > 0) return { session };
  const botCheckFailure = await getBotCheckFailure({ turnstileToken, botCheckKey, visitor });
  if (botCheckFailure) return { result: botCheckFailure };
  if (await isOverHourlyChatLimit(session.tenantId)) return { result: await getBusyResult(message) };
  await markFirstQuestion(session.id);
  return { session };
}

async function reportNoAnswer(reason: NoAnswerReason): Promise<void> {
  await reportVisitorProblem({ action: "site.chat_assistant", stage: "external", severity: "info", code: reason, detail: "Claude gave no usable answer; the visitor was offered a person." });
}

async function reportNotReady(code: NotReadyCode): Promise<AssistantReply> {
  // Comes from this deployment's own settings: one record per running copy, not per visitor.
  if (!isFirstInThisCopy(`site.chat_assistant:${code}`)) return getHandoffReply(HANDOFF_TEXT.unavailable);
  await reportVisitorProblem({ action: "site.chat_assistant", stage: "setup", severity: "warning", code, detail: "The assistant isn't set up; every visitor is offered a person." });
  return getHandoffReply(HANDOFF_TEXT.unavailable);
}

/** The rejected text, masked and shortened, so the owner can review what a check blocked (OWASP LLM05). */
function getRejectedDetail(rejectedText: string | undefined): string {
  if (rejectedText === undefined) return REJECTED_DETAIL;
  const maskedText = getRedactedText(rejectedText.normalize("NFKC")).replace(EMAIL_PATTERN, "[email removed]").replace(DIGIT_PATTERN, "#");
  return `${REJECTED_DETAIL} Rejected reply: ${maskedText.slice(0, MAX_REJECTED_DETAIL_LENGTH)}`;
}

async function reportRejectedReply({ reason, rejectedText }: { reason: HandoffReason | undefined; rejectedText: string | undefined }): Promise<void> {
  const severity = reason ? RECORDED_REJECTIONS[reason] : undefined;
  if (!reason || !severity) return;
  await reportVisitorProblem({ action: "site.chat_assistant", stage: "rule", severity, code: reason, detail: getRejectedDetail(rejectedText) });
}

/** The model is an outside service: any failure becomes a hand-off, never a broken chat. */
async function fetchReplyOrUnavailable(request: Parameters<typeof fetchAssistantReply>[0]): Promise<AssistantReply> {
  try {
    return await fetchAssistantReply(request);
  } catch (error) {
    await reportVisitorProblem({ action: "site.chat_assistant", stage: "external", ...getAssistantFailure(error) });
    return getHandoffReply(HANDOFF_TEXT.unavailable);
  }
}

async function fetchModelReply({ policyBody, turns }: { policyBody: string; turns: ChatTurn[] }): Promise<AssistantReply> {
  const model = getClaudeAnswerModel({ onNoAnswer: reportNoAnswer });
  if (!model) return reportNotReady("no_api_key");
  const { handoffReason, rejectedText, ...reply } = await fetchReplyOrUnavailable({ policyBody, turns, model });
  // The reason and rejected text are for the problem log only; the visitor's browser never receives them.
  await reportRejectedReply({ reason: handoffReason, rejectedText });
  return reply;
}

async function fetchEmergencyReply(tenantId: string): Promise<AssistantReply> {
  const policy = await fetchPublishedPolicy(tenantId);
  return getEmergencyReply(policy ? getPublicSections(policy.body) : []);
}

async function fetchReplyOrHandoff({ tenantId, turns }: { tenantId: string; turns: ChatTurn[] }): Promise<AssistantReply> {
  if (isEmergencyQuestion(turns.at(-1)?.body ?? "")) return fetchEmergencyReply(tenantId);
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
  // Only typed questions count: topic buttons cost nothing and never reach the AI.
  if (session.typedQuestionCount >= MAX_VISITOR_MESSAGES_PER_CHAT) return { status: "error", message: FULL_MESSAGE };
  const question = parsed.data.message;
  const turns: ChatTurn[] = [...session.turns.slice(-HISTORY_TURN_LIMIT), { role: "visitor", body: question }];
  const reply = getRepairedTurnReply({ reply: await fetchReplyOrHandoff({ tenantId: session.tenantId, turns }), turns });
  await recordChatExchange({ session, question, reply });
  return { status: "replied", sessionId: session.id, question: getRedactedText(question), reply };
}
