// How the Inbox unread count reads in the sidebar, phone bar, and for screen readers.

const MAX_SHOWN_COUNT = 99;

/** Badge text, capped so a large backlog cannot widen the menu ("99+"). */
export function getUnreadBadgeText(count: number): string {
  return count > MAX_SHOWN_COUNT ? `${MAX_SHOWN_COUNT}+` : String(count);
}

/** Screen-reader wording after the Inbox label, e.g. "(3 new)"; empty when nothing is waiting. */
export function getUnreadSpokenText(count: number): string {
  return count > 0 ? `(${count} new)` : "";
}
