import "server-only";

import { getLoaded, getLoadFailure, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";
import type { ChatOutcome } from "@/lib/chat/assistant-reply";

// Logged chats for the weekly review (Features §2), read through the signed-in session
// (RLS: owners and managers).

export const CHATS_PAGE_SIZE = 25;

export type ChatFilter = "all" | "handoffs";

/** source "guided": a topic button the visitor tapped, or its fixed answer (docs/cwr-chat-guided-options-plan.md §6). */
export type ChatMessageRow = { role: "visitor" | "assistant"; body: string; cited_sections: string[]; outcome: ChatOutcome | null; source: "typed" | "guided"; created_at: string };

export type ChatSessionSummary = { id: string; started_at: string; inbox_thread_id: string | null; chat_messages: ChatMessageRow[] };

export type ChatPage = { sessions: ChatSessionSummary[]; totalCount: number };

const SESSION_COLUMNS = "id, started_at, inbox_thread_id, chat_messages(role, body, cited_sections, outcome, source, created_at)";

export function getChatFilter(rawFilter: string | undefined): ChatFilter {
  return rawFilter === "handoffs" ? "handoffs" : "all";
}

function getSortedMessages(messages: ChatMessageRow[]): ChatMessageRow[] {
  return [...messages].sort((first, second) => first.created_at.localeCompare(second.created_at) || (first.role === "visitor" ? -1 : 1));
}

/** "handoffs": chats where the assistant could not answer at least once. */
export async function fetchChatPage({ supabase, tenantId }: AdminContext, { filter, page }: { filter: ChatFilter; page: number }): Promise<LoadResult<ChatPage>> {
  const from = (page - 1) * CHATS_PAGE_SIZE;
  const columns = filter === "handoffs" ? `${SESSION_COLUMNS}, handoffs:chat_messages!inner(id)` : SESSION_COLUMNS;
  const base = supabase.from("chat_sessions").select(columns, { count: "exact" }).eq("tenant_id", tenantId);
  const filtered = filter === "handoffs" ? base.eq("handoffs.outcome", "handoff") : base;
  const { data, count, error } = await filtered.order("started_at", { ascending: false }).range(from, from + CHATS_PAGE_SIZE - 1).returns<ChatSessionSummary[]>();
  if (error) return getLoadFailure("chat list", error);
  const sessions = (data ?? []).map((session) => ({ ...session, chat_messages: getSortedMessages(session.chat_messages) }));
  return getLoaded({ sessions, totalCount: count ?? 0 });
}

/** null data: no such chat. */
export async function fetchChatSession({ supabase, tenantId }: AdminContext, sessionId: string): Promise<LoadResult<ChatSessionSummary | null>> {
  const { data, error } = await supabase.from("chat_sessions").select(SESSION_COLUMNS).eq("tenant_id", tenantId).eq("id", sessionId).maybeSingle<ChatSessionSummary>();
  if (error) return getLoadFailure("chat", error);
  return getLoaded(data ? { ...data, chat_messages: getSortedMessages(data.chat_messages) } : null);
}
