import type { ListingStatus } from "@/lib/content/listings";

// Style §11.8 status tag: dark fill, white uppercase word, 8px dot in the status color
// (green Active, gold Pending, red Sold; owner choice 2026-09-27). The word always says it.

const STATUS_LABELS: Record<ListingStatus, string> = { active: "Active", pending: "Pending", sold: "Sold" };
const DOT_CLASSES: Record<ListingStatus, string> = { active: "bg-status-active", pending: "bg-gold", sold: "bg-status-sold" };

export function StatusTag({ status, isOverlay = false }: { status: ListingStatus; isOverlay?: boolean }) {
  const positionClass = isOverlay ? "absolute top-3 left-3 z-10" : "";
  return (
    <span className={`tone-dark type-tag inline-flex items-center gap-2 px-2.5 py-1.5 ${positionClass}`}>
      <span aria-hidden className={`size-2 rounded-full ${DOT_CLASSES[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
