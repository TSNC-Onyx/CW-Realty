import Link from "next/link";

import { ACTIVITY_SPANS, getActivityFigures, type ChatActivity } from "@/lib/admin/chats/activity";
import { getChatListHref, type ChatListState } from "@/lib/admin/chats/list-state";
import type { LoadResult } from "@/lib/admin/load-result";

// Chat history's activity figures with their span switch. The switch keeps the list's search,
// sort, and page, and doesn't scroll, so only the figures change. Figures that didn't load
// show "—", never 0.

export function ChatActivity({ activity, state, page }: { activity: LoadResult<ChatActivity>; state: ChatListState; page: number }) {
  const figures = getActivityFigures({ activity, span: state.span });
  return (
    <section aria-labelledby="chat-activity-heading" className="mb-10 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="chat-activity-heading" className="type-h3">
          Activity
        </h2>
        <nav aria-label="Activity span">
          <ul className="flex flex-wrap gap-2">
            {ACTIVITY_SPANS.map((span) => (
              <li key={span.value}>
                <Link
                  href={getChatListHref(state, { span: span.value, page })}
                  scroll={false}
                  aria-current={state.span === span.value ? "page" : undefined}
                  className={`btn btn-s ${state.span === span.value ? "btn-main" : "btn-secondary"}`}
                >
                  {span.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      {/* Phones: the number beside its label and change, so three figures stay short. 768px+: three columns with a note each. */}
      <ul className="grid gap-3 md:grid-cols-3 md:gap-4">
        {figures.map((figure) => (
          <li key={figure.key} className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 border-t-2 border-ink bg-surface p-4 md:grid-cols-1 md:content-start md:gap-y-1 md:p-6">
            <span className="type-h2 row-span-2 w-24 leading-none tabular-nums md:row-span-1 md:w-auto">{figure.value}</span>
            <span className="font-bold">{figure.label}</span>
            <span className="text-tag hidden leading-normal text-muted md:block">{figure.note}</span>
            <span className="text-tag leading-normal text-muted">{figure.change}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
