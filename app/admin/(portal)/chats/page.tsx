import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Pagination } from "@/components/content/pagination";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { CHATS_PAGE_SIZE, fetchChatPage, getChatFilter, type ChatFilter, type ChatSessionSummary } from "@/lib/admin/chats/queries";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { getPageNumber, getTotalPages } from "@/lib/content/page-number";

export const metadata: Metadata = { title: "Chat history" };

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const FILTERS: { value: ChatFilter; label: string; href: string }[] = [
  { value: "all", label: "All chats", href: "/admin/chats" },
  { value: "handoffs", label: "Couldn't answer", href: "/admin/chats?show=handoffs" },
];
const PREVIEW_LENGTH = 120;

function getChatLine(session: ChatSessionSummary): string {
  const questions = session.chat_messages.filter((message) => message.role === "visitor");
  const handoffCount = session.chat_messages.filter((message) => message.outcome === "handoff").length;
  const parts = [`${questions.length} ${questions.length === 1 ? "question" : "questions"}`];
  if (handoffCount > 0) parts.push(`${handoffCount} not answered`);
  if (session.inbox_thread_id) parts.push("sent to the inbox");
  return parts.join(" · ");
}

function getPreview(session: ChatSessionSummary): string {
  const firstQuestion = session.chat_messages.find((message) => message.role === "visitor")?.body ?? "No questions asked";
  return firstQuestion.length > PREVIEW_LENGTH ? `${firstQuestion.slice(0, PREVIEW_LENGTH)}…` : firstQuestion;
}

type ChatsPageProps = { searchParams: Promise<{ show?: string; page?: string }> };

export default async function ChatsPage({ searchParams }: ChatsPageProps) {
  const params = await searchParams;
  const admin = await requireAdminPage(EDITOR_ROLES);
  const filter = getChatFilter(params.show);
  const page = getPageNumber(params.page);
  if (page === null) notFound();
  const { sessions, totalCount } = await fetchChatPage(admin, { filter, page });
  return (
    <>
      <h1 className="type-h1 mb-2">Chat history</h1>
      <p className="type-lead mb-6 max-w-prose text-muted">Every conversation with the website&apos;s AI assistant, for the weekly review. Chats are kept for one year.</p>
      <nav aria-label="Filter chats" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <li key={option.value}>
              <Link href={option.href} aria-current={filter === option.value ? "page" : undefined} className={`btn btn-s ${filter === option.value ? "btn-main" : "btn-secondary"}`}>
                {option.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {sessions.length === 0 ? (
        <EmptyState icon={MessagesSquare} titleId="chats-empty" title="No chats yet" description="Conversations visitors have with the chat assistant show up here." action={<ButtonLink href="/admin" size="m" variant="main">Back to dashboard</ButtonLink>} />
      ) : (
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
      )}
      <Pagination basePath={filter === "all" ? "/admin/chats" : "/admin/chats?show=handoffs"} currentPage={page} totalPages={getTotalPages(totalCount, CHATS_PAGE_SIZE)} />
    </>
  );
}
