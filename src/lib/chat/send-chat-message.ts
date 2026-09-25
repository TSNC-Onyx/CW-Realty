import "server-only";

import { fetchAssistantReply, type ChatTurn } from "@/lib/chat/answer-question";
import { HANDOFF_TEXT, getHandoffReply, type AssistantReply } from "@/lib/chat/assistant-reply";
import { fetchChatTenantId, fetchOpenChatSession, fetchPublishedPolicy, isOverHourlyChatLimit, recordChatExchange, startChatSession, type ChatSession } from "@/lib/chat/chat-log";
import type { SendChatResult } from "@/lib/chat/chat-results";
import { CHAT_TURNSTILE_ACTION, MAX_VISITOR_MESSAGES_PER_CHAT, chatMessageSchema, type ChatMessageInput } from "@/lib/chat/chat-schemas";
import { getClaudeAnswerModel } from "@/lib/chat/claude-model";
import { getRedactedText } from "@/lib/chat/restricted-data";
import { isOverChatLimit } from "@/lib/security/rate-limit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import type { Visitor } from "@/lib/security/visitor";

// One visitor question → one logged reply (Phase 5 plan, architecture context).

// The model sees the latest turns only; the full chat stays in the log and the hand-off.
const HISTORY_TURN_LIMIT = 20;
const LIMITED_MESSAGE = "You're sending messages quickly. Wait a minute, then try again.";
const BLOCKED_MESSAGE = "We couldn't confirm you're a person. Reload the page and try again.";
const FULL_MESSAGE = "This chat has reached its length limit. Tap “Talk to a person” and our team will pick it up from here.";

type OpenedSession = { session: ChatSession } | { result: SendChatResult };

async function openNewSession({ question, turnstileToken, visitor }: { question: string; turnstileToken: string; visitor: Visitor }): Promise<OpenedSession> {
  const isHuman = await verifyTurnstileToken({ token: turnstileToken, remoteIp: visitor.ip, expectedAction: CHAT_TURNSTILE_ACTION, expectedHostname: visitor.hostname });
  if (!isHuman) return { result: { status: "error", message: BLOCKED_MESSAGE } };
  const tenantId = await fetchChatTenantId();
  if (await isOverHourlyChatLimit(tenantId)) return { result: { status: "replied", sessionId: null, question: getRedactedText(question), reply: getHandoffReply(HANDOFF_TEXT.unavailable) } };
  const policy = await fetchPublishedPolicy(tenantId);
  return { session: await startChatSession({ tenantId, policyId: policy?.id ?? null }) };
}

async function openSession({ sessionId, message, turnstileToken, visitor }: { sessionId: string | null; message: string; turnstileToken: string; visitor: Visitor }): Promise<OpenedSession> {
  if (sessionId === null) return openNewSession({ question: message, turnstileToken, visitor });
  const session = await fetchOpenChatSession(sessionId);
  return session ? { session } : { result: { status: "expired" } };
}

/** The model is an outside service: any failure becomes a hand-off, never a broken chat. */
async function fetchReplyOrHandoff({ tenantId, turns }: { tenantId: string; turns: ChatTurn[] }): Promise<AssistantReply> {
  const [policy, model] = [await fetchPublishedPolicy(tenantId), getClaudeAnswerModel()];
  if (!policy || !model) return getHandoffReply(HANDOFF_TEXT.unavailable);
  try {
    return await fetchAssistantReply({ policyBody: policy.body, turns, model });
  } catch (error) {
    console.error(JSON.stringify({ message: "Chat assistant reply failed", error: error instanceof Error ? error.name : "unknown" }));
    return getHandoffReply(HANDOFF_TEXT.unavailable);
  }
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
