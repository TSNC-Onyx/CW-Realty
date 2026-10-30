import { MessagesSquare, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ChatActivity } from "@/components/admin/chats/chat-activity";
import { ChatSearch } from "@/components/admin/chats/chat-search";
import { ChatSortHeader } from "@/components/admin/chats/chat-sort-header";
import { ChatSortMenu } from "@/components/admin/chats/chat-sort-menu";
import { LoadProblem } from "@/components/admin/load-problem";
import { Pagination } from "@/components/content/pagination";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { getSpanRanges } from "@/lib/admin/chats/activity";
import { getChatListHref, getChatListState, type ChatListParams, type ChatListState } from "@/lib/admin/chats/list-state";
import { CHATS_PAGE_SIZE, fetchChatActivity, fetchChatPage, type ChatListRow } from "@/lib/admin/chats/queries";
import { showPageNotFound } from "@/lib/admin/record-page-not-found";
import { reportPageLoad } from "@/lib/admin/report-page-load";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { getPageNumber, getTotalPages } from "@/lib/content/page-number";

export const metadata: Metadata = { title: "Chat history" };

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const FILTERS: { value: ChatListState["filter"]; label: string }[] = [
  { value: "all", label: "All chats" },
  { value: "handoffs", label: "Couldn't answer" },
];
const PREVIEW_LENGTH = 120;

function getChatLine(session: ChatListRow): string {
  const parts = [`${session.question_count} ${session.question_count === 1 ? "question" : "questions"}`];
  if (session.handoff_count > 0) parts.push(`${session.handoff_count} not answered`);
  if (session.inbox_thread_id) parts.push("sent to the inbox");
  return parts.join(" · ");
}

function getPreview(session: ChatListRow): string {
  const firstQuestion = session.first_question ?? "No questions asked";
  return firstQuestion.length > PREVIEW_LENGTH ? `${firstQuestion.slice(0, PREVIEW_LENGTH)}…` : firstQuestion;
}

function ChatList({ sessions, state }: { sessions: ChatListRow[]; state: ChatListState }) {
  if (sessions.length === 0 && state.search) {
    return <EmptyState icon={SearchX} titleId="chats-empty" title="No chats match your search" description={`Nothing in the kept chats contains "${state.search}". Try fewer or different words.`} action={<ButtonLink href={getChatListHref(state, { search: "" })} size="m" variant="main">Clear the search</ButtonLink>} />;
  }
  if (sessions.length === 0) {
    return <EmptyState icon={MessagesSquare} titleId="chats-empty" title="No chats yet" description="Conversations visitors have with the chat assistant show up here." action={<ButtonLink href="/admin" size="m" variant="main">Back to dashboard</ButtonLink>} />;
  }
  return (
    <>
      <ChatSortHeader state={state} />
      <ChatSortMenu state={state} />
      <ul className="border-b border-line">
        {sessions.map((session) => (
          <li key={session.id} className="border-t border-line">
            <Link href={`/admin/chats/${session.id}`} className="group grid gap-1 py-4 md:grid-cols-12 md:items-center">
              <span className="font-semibold underline-offset-4 group-hover:underline md:col-span-6">{getPreview(session)}</span>
              <span className="type-small text-muted md:col-span-4">{getChatLine(session)}</span>
              <span className="type-small text-muted md:col-span-2">{DATE_TIME.format(new Date(session.started_at))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

type ChatsPageProps = { searchParams: Promise<ChatListParams & { page?: string | string[] }> };

export default async function ChatsPage({ searchParams }: ChatsPageProps) {
  const params = await searchParams;
  const admin = await requireAdminPage(EDITOR_ROLES);
  const state = getChatListState(params);
  const page = getPageNumber(params.page);
  if (page === null) return showPageNotFound({ admin, path: "/admin/chats" });
  const [chatPage, activity] = await Promise.all([fetchChatPage(admin, { state, page }), fetchChatActivity(admin, getSpanRanges(state.span, new Date()))]);
  const totalPages = chatPage.isLoaded ? getTotalPages(chatPage.data.totalCount, CHATS_PAGE_SIZE) : 1;
  // An old link or bookmark can point past the end once chats are removed: show the last page.
  if (chatPage.isLoaded && page > totalPages) redirect(getChatListHref(state, { page: totalPages }));
  const notice = await reportPageLoad({ admin, action: "chats.load", results: [chatPage, activity] });
  return (
    <>
      <h1 className="type-h1 mb-2">Chat history</h1>
      <p className="type-lead mb-6 max-w-prose text-muted">Every conversation with the website&apos;s AI assistant, for the weekly review. Chats are kept for one year.</p>
      <ChatActivity activity={activity} state={state} page={page} />
      <h2 className="type-h3 mb-4">Chats</h2>
      <nav aria-label="Filter chats" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <li key={option.value}>
              <Link href={getChatListHref(state, { filter: option.value })} scroll={false} aria-current={state.filter === option.value ? "page" : undefined} className={`btn btn-s ${state.filter === option.value ? "btn-main" : "btn-secondary"}`}>
                {option.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <ChatSearch state={state} />
      {chatPage.isLoaded ? (
        <>
          <ChatList sessions={chatPage.data.sessions} state={state} />
          <Pagination basePath={getChatListHref(state)} currentPage={page} totalPages={totalPages} />
        </>
      ) : (
        <LoadProblem notice={notice} title="Chats didn't load" />
      )}
    </>
  );
}
