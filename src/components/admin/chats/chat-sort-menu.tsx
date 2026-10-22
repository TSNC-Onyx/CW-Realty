"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { getChatListHref, SORT_OPTIONS, type ChatListState } from "@/lib/admin/chats/list-state";

// "Sort by" menu for phones and small tablets (under 768px), where the column headings are
// hidden. The menu shows the new choice at once and returns to the address's sort after Back or
// Forward; the list follows without scrolling the page.

function getOptionValue({ sort, direction }: Pick<ChatListState, "sort" | "direction">): string {
  return `${sort}-${direction}`;
}

export function ChatSortMenu({ state }: { state: ChatListState }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setOptimisticValue] = useOptimistic(getOptionValue(state));

  const handleChange = (nextValue: string) => {
    const option = SORT_OPTIONS.find((candidate) => getOptionValue(candidate) === nextValue);
    if (!option) return;
    startTransition(() => {
      setOptimisticValue(nextValue);
      router.push(getChatListHref(state, { sort: option.sort, direction: option.direction }), { scroll: false });
    });
  };

  return (
    <div className="mb-4 grid gap-1 md:hidden">
      <label htmlFor="chat-sort" className="text-base font-bold">
        Sort by
      </label>
      <select id="chat-sort" value={value} aria-busy={isPending} onChange={(event) => handleChange(event.target.value)} className="field-input">
        {SORT_OPTIONS.map((option) => (
          <option key={getOptionValue(option)} value={getOptionValue(option)}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
