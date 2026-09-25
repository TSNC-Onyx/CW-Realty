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
const MAX_NEW_CHATS_PER_HOUR = 200;
const HISTORY_TURN_LIMIT = 20;

export class ChatLogError extends Error {
  constructor(readonly context: { step: string; cause?: unknown }) {
    super(`Chat log step failed: ${context.step}`);
    this.name = "ChatLogError";
  }
}

export type ChatSession = { id: string; tenantId: string; visitorMessageCount: number; turns: ChatTurn[] };

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

export async function isOverHourlyChatLimit(tenantId: string): Promise<boolean> {
  const since = new Date(Date.now() - HOUR_MS).toISOString();
  const { count, error } = await createServiceClient().from("chat_sessions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("started_at", since);
  if (error) throw new ChatLogError({ step: "isOverHourlyChatLimit", cause: error });
  return (count ?? 0) >= MAX_NEW_CHATS_PER_HOUR;
}

export async function startChatSession({ tenantId, policyId }: { tenantId: string; policyId: string | null }): Promise<ChatSession> {
  const result = await createServiceClient().from("chat_sessions").insert({ tenant_id: tenantId, policy_id: policyId }).select("id").single<{ id: string }>();
  return { id: getChecked(result, "startChatSession").id, tenantId, visitorMessageCount: 0, turns: [] };
}

type MessageRow = { role: ChatTurn["role"]; body: string };

async function fetchSessionTurns(sessionId: string): Promise<ChatTurn[]> {
  const result = await createServiceClient().from("chat_messages").select("role, body").eq("session_id", sessionId).order("created_at").order("role").returns<MessageRow[]>();
  return getChecked(result, "fetchSessionTurns").map((row) => ({ role: row.role, body: row.body }));
}

/** A chat idle for a day is closed, so an old or shared link cannot reopen it. */
export async function fetchOpenChatSession(sessionId: string): Promise<ChatSession | null> {
  const since = new Date(Date.now() - SESSION_IDLE_LIMIT_MS).toISOString();
  const { data, error } = await createServiceClient().from("chat_sessions").select("id, tenant_id").eq("id", sessionId).is("ended_at", null).gte("last_message_at", since).maybeSingle<{ id: string; tenant_id: string }>();
  if (error) throw new ChatLogError({ step: "fetchOpenChatSession", cause: error });
  if (!data) return null;
  const turns = await fetchSessionTurns(data.id);
  return { id: data.id, tenantId: data.tenant_id, visitorMessageCount: turns.filter((turn) => turn.role === "visitor").length, turns: turns.slice(-HISTORY_TURN_LIMIT) };
}

/** Saves the visitor's question (numbers removed) and the reply in one statement. */
export async function recordChatExchange({ session, question, reply }: { session: ChatSession; question: string; reply: AssistantReply }): Promise<void> {
  const client = createServiceClient();
  const rows = [
    { tenant_id: session.tenantId, session_id: session.id, role: "visitor", body: getRedactedText(question) },
    { tenant_id: session.tenantId, session_id: session.id, role: "assistant", body: reply.text, cited_sections: reply.citedSections, outcome: reply.outcome },
  ];
  const { error } = await client.from("chat_messages").insert(rows);
  if (error) throw new ChatLogError({ step: "recordChatExchange", cause: error });
  const { error: touchError } = await client.from("chat_sessions").update({ last_message_at: new Date().toISOString() }).eq("id", session.id);
  if (touchError) throw new ChatLogError({ step: "touchChatSession", cause: touchError });
}

export async function linkChatHandoff({ sessionId, threadId }: { sessionId: string; threadId: string }): Promise<void> {
  const { error } = await createServiceClient().from("chat_sessions").update({ inbox_thread_id: threadId }).eq("id", sessionId);
  if (error) throw new ChatLogError({ step: "linkChatHandoff", cause: error });
}
