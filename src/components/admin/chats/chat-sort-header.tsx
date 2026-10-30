import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";

import { getChatListHref, getSortChange, getSortLabel, type ChatListState, type ChatSort } from "@/lib/admin/chats/list-state";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Column headings above the chat list (768px and wider); each one sorts by its column, and the
// sorted one reverses on a second click. The columns line up with the list rows below.

const COLUMNS: { sort: ChatSort; label: string; spanClass: string }[] = [
  { sort: "question", label: "Question", spanClass: "md:col-span-6" },
  { sort: "details", label: "Details", spanClass: "md:col-span-4" },
  { sort: "date", label: "Date", spanClass: "md:col-span-2" },
];

export function ChatSortHeader({ state }: { state: ChatListState }) {
  return (
    <nav aria-label="Sort chats" className="hidden md:block">
      <ul className="grid grid-cols-12">
        {COLUMNS.map((column) => (
          <li key={column.sort} className={column.spanClass}>
            <SortLink column={column} state={state} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SortLink({ column, state }: { column: (typeof COLUMNS)[number]; state: ChatListState }) {
  const isSorted = state.sort === column.sort;
  const Arrow = state.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={getChatListHref(state, getSortChange(state, column.sort))}
      scroll={false}
      aria-current={isSorted ? "true" : undefined}
      className="type-small inline-flex min-h-11 min-w-11 items-center gap-1 font-bold text-muted underline-offset-4 hover:text-ink hover:underline aria-[current]:text-ink"
    >
      {column.label}
      {isSorted && (
        <>
          <Arrow aria-hidden size={ICON_SIZE.chevron} />
          <span className="sr-only">{` (sorted: ${getSortLabel(state).toLowerCase()})`}</span>
        </>
      )}
    </Link>
  );
}
