import { Inbox } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { InboxStatusLabel } from "@/components/admin/inbox/inbox-status";
import { EmptyState } from "@/components/ui/empty-state";
import { SOURCE_LABELS } from "@/lib/admin/inbox/inbox-labels";
import type { InboxThreadSummary } from "@/lib/admin/inbox/queries";

// The newest open requests, so the day starts from the dashboard (Admin §5).

const INBOX_PATH = "/admin/inbox";
const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function MessageRow({ thread }: { thread: InboxThreadSummary }) {
  return (
    <li className="border-b border-line">
      <Link href={`${INBOX_PATH}/${thread.id}`} className="group grid min-h-14 gap-1 py-3 md:grid-cols-12 md:items-center md:gap-4">
        <span className={`md:col-span-4 ${thread.status === "new" ? "font-bold" : "font-semibold"} underline-offset-4 group-hover:underline`}>{thread.contact_name}</span>
        <span className="type-small text-muted md:col-span-3">{SOURCE_LABELS[thread.source]}</span>
        <span className="md:col-span-2">
          <InboxStatusLabel status={thread.status} />
        </span>
        <span className="type-small text-muted md:col-span-3">{DATE_TIME.format(new Date(thread.created_at))}</span>
      </Link>
    </li>
  );
}

export function LatestMessages({ threads, emptyAction }: { threads: InboxThreadSummary[]; emptyAction: ReactNode }) {
  return (
    <section aria-labelledby="latest-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b-2 border-ink pb-2">
        <h2 id="latest-heading" className="type-h3">
          Latest messages
        </h2>
        <Link href={INBOX_PATH} className="text-link text-sm">
          Open inbox
        </Link>
      </div>
      {threads.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={Inbox} titleId="latest-empty" title="No open messages" description="Contact, TouchUp, and chat requests from the website appear here as they arrive." action={emptyAction} />
        </div>
      ) : (
        <ul>
          {threads.map((thread) => (
            <MessageRow key={thread.id} thread={thread} />
          ))}
        </ul>
      )}
    </section>
  );
}
