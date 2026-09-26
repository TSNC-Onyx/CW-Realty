import { getUnreadBadgeText, getUnreadSpokenText } from "@/lib/admin/unread-count";

// Gold count on dark surfaces; screen readers hear "(3 new)" after the Inbox label.
export function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <>
      <span aria-hidden className="inline-flex h-6 min-w-6 items-center justify-center bg-gold px-1.5 text-tag leading-none font-bold text-dark">
        {getUnreadBadgeText(count)}
      </span>
      <span className="sr-only">{` ${getUnreadSpokenText(count)}`}</span>
    </>
  );
}
