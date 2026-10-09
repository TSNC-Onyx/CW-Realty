import "server-only";

import type { ChatTurn } from "@/lib/chat/answer-question";
import type { AssistantReply } from "@/lib/chat/assistant-reply";
import { getRedactedText } from "@/lib/chat/restricted-data";
import { CWR_TENANT_SLUG } from "@/lib/supabase/public-client";
import { createServiceClient } from "@/lib/supabase/service-client";

// Every chat is logged for the weekly review (Features §2). Visitors have no database
// access of their own, so the server writes with the service role after its own checks.

const SESSION_IDLE_LIMIT_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// Site-wide cost guard (Phase 5 plan, decision 8): beyond this, chat offers a person only.
// Counted by each chat's first typed question, so topic buttons can neither use it up nor skip it.
const MAX_NEW_CHATS_PER_HOUR = 200;
// Chats started by topic buttons (no AI, fixed text): their own, larger cap, so a flood of taps
// can't fill the chat log (docs/cwr-chat-guided-options-plan.md §12).
const MAX_NEW_TOPIC_CHATS_PER_HOUR = 1000;
// The latest topic exchange the AI sees: enough context for a typed follow-up, without taps
// crowding typed questions out of the history it reads.
const TOPIC_TURNS_IN_HISTORY = 2;

export class ChatLogError extends Error {
  constructor(readonly context: { step: string; cause?: unknown }) {
    super(`Chat log step failed: ${context.step}`);
    this.name = "ChatLogError";
  }
}

/** typedQuestionCount: questions the visitor wrote (the per-chat limit); guidedStepCount: topic buttons tapped. */
export type ChatSession = { id: string; tenantId: string; typedQuestionCount: number; guidedStepCount: number; turns: ChatTurn[] };

/** A topic button's fixed answer and the policy section it came from (empty when none). */
export type GuidedExchange = { label: string; text: string; section: string };

export type PublishedPolicy = { id: string; body: string };

type Result<Row> = { data: Row | null; error: unknown };

function getChecked<Row>({ data, error }: Result<Row>, step: string): Row {
  if (error || data === null) throw new ChatLogError({ step, cause: error });
  return data;
}

export async function fetchChatTenantId(): Promise<string> {
  const result = await createServiceClient().from("tenants").select("id").eq("slug", CWR_TENANT_SLUG).single<{ id: string }>();
  return getChecked(result, "fetchChatTenantId").id;
}

export async function fetchPublishedPolicy(tenantId: string): Promise<PublishedPolicy | null> {
  const { data, error } = await createServiceClient().from("chat_policies").select("id, body").eq("tenant_id", tenantId).eq("status", "published").maybeSingle<PublishedPolicy>();
  if (error) throw new ChatLogError({ step: "fetchPublishedPolicy", cause: error });
  return data;
}

/** The owner's on/off switch (decision D4). On when the tenant has no settings row yet. */
export async function fetchIsAssistantOn(tenantId: string): Promise<boolean> {
  const { data, error } = await createServiceClient().from("site_settings").select("is_assistant_on").eq("tenant_id", tenantId).maybeSingle<{ is_assistant_on: boolean }>();
  if (error) throw new ChatLogError({ step: "fetchIsAssistantOn", cause: error });
  return data?.is_assistant_on ?? true;
}

export async function isOverHourlyChatLimit(tenantId: string): Promise<boolean> {
  const since = new Date(Date.now() - HOUR_MS).toISOString();
  const { count, error } = await createServiceClient().from("chat_sessions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("first_question_at", since);
  if (error) throw new ChatLogError({ step: "isOverHourlyChatLimit", cause: error });
  return (count ?? 0) >= MAX_NEW_CHATS_PER_HOUR;
}

/** Chats started by topic buttons in the last hour, which have no typed question yet. */
export async function isOverHourlyTopicChatLimit(tenantId: string): Promise<boolean> {
  const since = new Date(Date.now() - HOUR_MS).toISOString();
  const { count, error } = await createServiceClient().from("chat_sessions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).is("first_question_at", null).gte("started_at", since);
  if (error) throw new ChatLogError({ step: "isOverHourlyTopicChatLimit", cause: error });
  return (count ?? 0) >= MAX_NEW_TOPIC_CHATS_PER_HOUR;
}

/** isTopicStart: a topic button starts the chat, so it has no typed question yet. */
export async function startChatSession({ tenantId, policyId, isTopicStart = false }: { tenantId: string; policyId: string | null; isTopicStart?: boolean }): Promise<ChatSession> {
  const row = { tenant_id: tenantId, policy_id: policyId, first_question_at: isTopicStart ? null : new Date().toISOString() };
  const result = await createServiceClient().from("chat_sessions").insert(row).select("id").single<{ id: string }>();
  return { id: getChecked(result, "startChatSession").id, tenantId, typedQuestionCount: 0, guidedStepCount: 0, turns: [] };
}

/** A chat started by topic buttons gets its first typed question: it now counts toward the hourly limit. */
export async function markFirstQuestion(sessionId: string): Promise<void> {
  const { error } = await createServiceClient().from("chat_sessions").update({ first_question_at: new Date().toISOString() }).eq("id", sessionId).is("first_question_at", null);
  if (error) throw new ChatLogError({ step: "markFirstQuestion", cause: error });
}

type MessageSource = "typed" | "guided";

export type MessageRow = { role: ChatTurn["role"]; body: string; source: MessageSource };

async function fetchSessionMessages(sessionId: string): Promise<MessageRow[]> {
  const result = await createServiceClient().from("chat_messages").select("role, body, source").eq("session_id", sessionId).order("created_at").order("role").returns<MessageRow[]>();
  return getChecked(result, "fetchSessionTurns");
}

/** Every typed exchange, plus only the latest topic exchange. */
export function getHistoryRows(rows: MessageRow[]): MessageRow[] {
  const guidedIndexes = rows.flatMap((row, index) => (row.source === "guided" ? [index] : []));
  const keptGuided = new Set(guidedIndexes.slice(-TOPIC_TURNS_IN_HISTORY));
  return rows.filter((row, index) => row.source !== "guided" || keptGuided.has(index));
}

function countVisitorRows(rows: MessageRow[], source: MessageSource): number {
  return rows.filter((row) => row.role === "visitor" && row.source === source).length;
}

/** A chat idle for a day is closed, so an old or shared link cannot reopen it. */
export async function fetchOpenChatSession(sessionId: string): Promise<ChatSession | null> {
  const since = new Date(Date.now() - SESSION_IDLE_LIMIT_MS).toISOString();
  const { data, error } = await createServiceClient().from("chat_sessions").select("id, tenant_id").eq("id", sessionId).is("ended_at", null).gte("last_message_at", since).maybeSingle<{ id: string; tenant_id: string }>();
  if (error) throw new ChatLogError({ step: "fetchOpenChatSession", cause: error });
  if (!data) return null;
  // Topic buttons and their answers are part of the turns, so a typed follow-up has their context.
  const rows = await fetchSessionMessages(data.id);
  const turns = getHistoryRows(rows).map((row) => ({ role: row.role, body: row.body }));
  return { id: data.id, tenantId: data.tenant_id, typedQuestionCount: countVisitorRows(rows, "typed"), guidedStepCount: countVisitorRows(rows, "guided"), turns };
}

async function insertExchange({ session, rows, step }: { session: ChatSession; rows: Record<string, unknown>[]; step: string }): Promise<void> {
  const client = createServiceClient();
  const { error } = await client.from("chat_messages").insert(rows);
  if (error) throw new ChatLogError({ step, cause: error });
  const { error: touchError } = await client.from("chat_sessions").update({ last_message_at: new Date().toISOString() }).eq("id", session.id);
  if (touchError) throw new ChatLogError({ step: "touchChatSession", cause: touchError });
}

/** Saves the visitor's question (numbers removed) and the reply in one statement. Both rows
 * list every column: a multi-row insert fills a missing column with null, not its default. */
export async function recordChatExchange({ session, question, reply }: { session: ChatSession; question: string; reply: AssistantReply }): Promise<void> {
  const rows = [
    { tenant_id: session.tenantId, session_id: session.id, role: "visitor", body: getRedactedText(question), cited_sections: [], outcome: null, source: "typed" },
    { tenant_id: session.tenantId, session_id: session.id, role: "assistant", body: reply.text, cited_sections: reply.citedSections, outcome: reply.outcome, source: "typed" },
  ];
  await insertExchange({ session, rows, step: "recordChatExchange" });
}

/** Saves a topic button (its label) and the fixed answer the visitor saw (docs/cwr-chat-guided-options-plan.md §6). */
export async function recordGuidedExchange({ session, exchange }: { session: ChatSession; exchange: GuidedExchange }): Promise<void> {
  const citedSections = exchange.section ? [exchange.section] : [];
  const rows = [
    { tenant_id: session.tenantId, session_id: session.id, role: "visitor", body: exchange.label, cited_sections: [], outcome: null, source: "guided" },
    { tenant_id: session.tenantId, session_id: session.id, role: "assistant", body: exchange.text, cited_sections: citedSections, outcome: "answer", source: "guided" },
  ];
  await insertExchange({ session, rows, step: "recordGuidedExchange" });
}

/** Links the chat to its first hand-off only; a later hand-off never re-points it. */
export async function linkChatHandoff({ sessionId, threadId }: { sessionId: string; threadId: string }): Promise<void> {
  const { error } = await createServiceClient().from("chat_sessions").update({ inbox_thread_id: threadId }).eq("id", sessionId).is("inbox_thread_id", null);
  if (error) throw new ChatLogError({ step: "linkChatHandoff", cause: error });
}
