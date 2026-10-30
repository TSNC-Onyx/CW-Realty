import "server-only";

import type { ActivityCounts, ChatActivity, SpanRanges, TimeRange } from "@/lib/admin/chats/activity";
import { getSearchPattern, type ChatListState } from "@/lib/admin/chats/list-state";
import { getLoaded, getLoadFailure, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";
import type { ChatOutcome } from "@/lib/chat/assistant-reply";

// Logged chats for the weekly review (Features §2), read through the signed-in session
// (RLS: owners and managers).

export const CHATS_PAGE_SIZE = 25;
// PostgREST's answer when a page starts past the last row (an old link, or chats removed since).
const PAST_LAST_PAGE_CODE = "PGRST103";
const LIST_COLUMNS = "id, started_at, inbox_thread_id, question_count, handoff_count, first_question";

/** source "guided": a topic button the visitor tapped, or its fixed answer (docs/cwr-chat-guided-options-plan.md §6). */
export type ChatMessageRow = { role: "visitor" | "assistant"; body: string; cited_sections: string[]; outcome: ChatOutcome | null; source: "typed" | "guided"; created_at: string };

export type ChatSessionSummary = { id: string; started_at: string; inbox_thread_id: string | null; chat_messages: ChatMessageRow[] };

/** question_count: every visitor message (typed questions and topic-button taps). first_question: null when there were none. */
export type ChatListRow = { id: string; started_at: string; inbox_thread_id: string | null; question_count: number; handoff_count: number; first_question: string | null };

export type ChatPage = { sessions: ChatListRow[]; totalCount: number };

const SESSION_COLUMNS = "id, started_at, inbox_thread_id, chat_messages(role, body, cited_sections, outcome, source, created_at)";

type ActivityRow = { chats: number; sent_to_inbox: number; typed_replies: number; typed_answers: number };

function getSortedMessages(messages: ChatMessageRow[]): ChatMessageRow[] {
  return [...messages].sort((first, second) => first.created_at.localeCompare(second.created_at) || (first.role === "visitor" ? -1 : 1));
}

/** A page past the end loads as empty with the real total, so the page can move to the last one. */
export async function fetchChatPage(admin: AdminContext, { state, page }: { state: ChatListState; page: number }): Promise<LoadResult<ChatPage>> {
  const from = (page - 1) * CHATS_PAGE_SIZE;
  const { data, count, error } = await getChatListQuery(admin, { state, columns: LIST_COLUMNS }).range(from, from + CHATS_PAGE_SIZE - 1).returns<ChatListRow[]>();
  if (error?.code === PAST_LAST_PAGE_CODE) return fetchChatCount(admin, state);
  if (error) return getLoadFailure("chat list", error);
  return getLoaded({ sessions: data ?? [], totalCount: count ?? 0 });
}

export async function fetchChatActivity(admin: AdminContext, ranges: SpanRanges): Promise<LoadResult<ChatActivity>> {
  const [current, previous] = await Promise.all([fetchActivityCounts(admin, ranges.current), fetchActivityCounts(admin, ranges.previous)]);
  if (!current.isLoaded) return current;
  if (!previous.isLoaded) return previous;
  return getLoaded({ current: current.data, previous: previous.data });
}

async function fetchChatCount(admin: AdminContext, state: ChatListState): Promise<LoadResult<ChatPage>> {
  const { count, error } = await getChatListQuery(admin, { state, columns: "id", isHead: true });
  if (error) return getLoadFailure("chat list", error);
  return getLoaded({ sessions: [], totalCount: count ?? 0 });
}

async function fetchActivityCounts({ supabase, tenantId }: AdminContext, { from, to }: TimeRange): Promise<LoadResult<ActivityCounts>> {
  const { data, error } = await supabase.rpc("chat_activity", { p_tenant_id: tenantId, p_from: from.toISOString(), p_to: to.toISOString() }).single<ActivityRow>();
  if (error) return getLoadFailure("chat activity", error);
  return getLoaded({ chats: data.chats, sentToInbox: data.sent_to_inbox, typedReplies: data.typed_replies, typedAnswers: data.typed_answers });
}

/** "handoffs": chats where the assistant could not answer at least once. A search matches any
 * message, visitor's or assistant's. Each sort ends with newest first, then id, so a page never
 * shows a chat twice or skips one when two chats tie. */
function getChatListQuery({ supabase, tenantId }: AdminContext, { state, columns, isHead = false }: { state: ChatListState; columns: string; isHead?: boolean }) {
  const handoffEmbed = state.filter === "handoffs" ? ", handoffs:chat_messages!inner(session_id)" : "";
  const searchEmbed = state.search ? ", matches:chat_messages!inner(session_id)" : "";
  const base = supabase.from("chat_sessions").select(`${columns}${handoffEmbed}${searchEmbed}`, { count: "exact", head: isHead }).eq("tenant_id", tenantId);
  const filtered = state.filter === "handoffs" ? base.eq("handoffs.outcome", "handoff") : base;
  const searched = state.search ? filtered.ilike("matches.body", getSearchPattern(state.search)) : filtered;
  const isAscending = state.direction === "asc";
  const sorted =
    state.sort === "question"
      ? searched.order("first_question_sort", { ascending: isAscending, nullsFirst: false })
      : state.sort === "details"
        ? searched.order("question_count", { ascending: isAscending }).order("handoff_count", { ascending: isAscending })
        : searched.order("started_at", { ascending: isAscending });
  return sorted.order("started_at", { ascending: false }).order("id");
}

/** null data: no such chat. */
export async function fetchChatSession({ supabase, tenantId }: AdminContext, sessionId: string): Promise<LoadResult<ChatSessionSummary | null>> {
  const { data, error } = await supabase.from("chat_sessions").select(SESSION_COLUMNS).eq("tenant_id", tenantId).eq("id", sessionId).maybeSingle<ChatSessionSummary>();
  if (error) return getLoadFailure("chat", error);
  return getLoaded(data ? { ...data, chat_messages: getSortedMessages(data.chat_messages) } : null);
}
