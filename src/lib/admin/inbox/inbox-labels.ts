// Plain words for inbox values (Style §2: never color alone — every status has a label).

export type InboxStatus = "new" | "assigned" | "replied" | "closed";
export type InboxFilter = InboxStatus | "open";
export type InboxSource = "contact" | "booking" | "chat_handoff";

export const INBOX_FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "open", label: "All open" },
  { value: "new", label: "New" },
  { value: "assigned", label: "Assigned" },
  { value: "replied", label: "Replied" },
  { value: "closed", label: "Closed" },
];

export const STATUS_LABELS: Record<InboxStatus, string> = { new: "New", assigned: "Assigned", replied: "Replied", closed: "Closed" };

export const SOURCE_LABELS: Record<InboxSource, string> = { contact: "Contact form", booking: "TouchUp request", chat_handoff: "Chat handoff" };

export function getInboxFilter(value: string | undefined): InboxFilter {
  return INBOX_FILTERS.some((filter) => filter.value === value) ? (value as InboxFilter) : "open";
}
