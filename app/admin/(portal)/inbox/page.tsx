import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InboxStatusLabel } from "@/components/admin/inbox/inbox-status";
import { Pagination } from "@/components/content/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button-link";
import { INBOX_FILTERS, SOURCE_LABELS, getInboxFilter } from "@/lib/admin/inbox/inbox-labels";
import { INBOX_PAGE_SIZE, fetchInboxPage, fetchTeammates } from "@/lib/admin/inbox/queries";
import { ALL_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { getPageNumber, getTotalPages } from "@/lib/content/page-number";

export const metadata: Metadata = { title: "Inbox" };

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

type InboxPageProps = { searchParams: Promise<{ status?: string; page?: string }> };

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const params = await searchParams;
  const admin = await requireAdminPage(ALL_ROLES);
  const filter = getInboxFilter(params.status);
  const page = getPageNumber(params.page);
  if (page === null) notFound();
  const [{ threads, totalCount }, teammates] = await Promise.all([fetchInboxPage(admin, { filter, page }), fetchTeammates(admin)]);
  const names = new Map(teammates.map((teammate) => [teammate.userId, teammate.label]));
  return (
    <>
      <h1 className="type-h1 mb-2">Inbox</h1>
      <p className="type-lead mb-6 text-muted">{admin.role === "staff" ? "Messages assigned to you." : "Contact, TouchUp, and chat requests from the website."}</p>
      <nav aria-label="Filter messages" className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {INBOX_FILTERS.map((option) => (
            <li key={option.value}>
              <Link
                href={option.value === "open" ? "/admin/inbox" : `/admin/inbox?status=${option.value}`}
                aria-current={filter === option.value ? "page" : undefined}
                className={`btn btn-s ${filter === option.value ? "btn-main" : "btn-secondary"}`}
              >
                {option.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {threads.length === 0 ? (
        <EmptyState icon={Inbox} titleId="inbox-empty" title="Nothing here right now" description="New requests from the website's forms show up here, and alerts go to the people set up in Notifications." action={<ButtonLink href="/admin" size="m" variant="main">Back to dashboard</ButtonLink>} />
      ) : (
        <ul className="border-b border-line">
          {threads.map((thread) => (
            <li key={thread.id} className="border-t border-line">
              <Link href={`/admin/inbox/${thread.id}`} className="group grid gap-1 py-4 md:grid-cols-12 md:items-center">
                <span className={`md:col-span-4 ${thread.status === "new" ? "font-bold" : "font-semibold"} underline-offset-4 group-hover:underline`}>{thread.contact_name}</span>
                <span className="type-small text-muted md:col-span-3">{SOURCE_LABELS[thread.source]}</span>
                <span className="md:col-span-2">
                  <InboxStatusLabel status={thread.status} />
                </span>
                <span className="type-small text-muted md:col-span-3">
                  {DATE_TIME.format(new Date(thread.created_at))}
                  {thread.assignee_id ? ` · ${names.get(thread.assignee_id) ?? "Assigned"}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination basePath={filter === "open" ? "/admin/inbox" : `/admin/inbox?status=${filter}`} currentPage={page} totalPages={getTotalPages(totalCount, INBOX_PAGE_SIZE)} />
    </>
  );
}
