import type { ListingStatus } from "@/lib/content/listings";

// Style §11.8 status tag: dark fill, white uppercase word, gold 8px dot (never color alone).

const STATUS_LABELS: Record<ListingStatus, string> = { active: "Active", pending: "Pending", sold: "Sold" };

export function StatusTag({ status, isOverlay = false }: { status: ListingStatus; isOverlay?: boolean }) {
  const positionClass = isOverlay ? "absolute top-3 left-3 z-10" : "";
  return (
    <span className={`tone-dark type-tag inline-flex items-center gap-2 px-2.5 py-1.5 ${positionClass}`}>
      <span aria-hidden className="size-2 rounded-full bg-gold" />
      {STATUS_LABELS[status]}
    </span>
  );
}
