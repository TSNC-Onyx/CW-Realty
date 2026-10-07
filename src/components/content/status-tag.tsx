import { LISTING_STATUS_LABELS, type ListingStatus } from "@/lib/content/listing-statuses";

// Style §11.8 status tag: dark fill, white uppercase word, 8px dot in the status color
// (white Coming Soon, green For Sale, gold Under Contract, red Sold; owner choices
// 2026-09-27 and 2026-10-02). The word always says it.

const DOT_CLASSES: Record<ListingStatus, string> = {
  coming_soon: "bg-on-dark",
  for_sale: "bg-status-for-sale",
  under_contract: "bg-gold",
  sold: "bg-status-sold",
};

export function StatusTag({ status, isOverlay = false }: { status: ListingStatus; isOverlay?: boolean }) {
  const positionClass = isOverlay ? "absolute top-3 left-3 z-10" : "";
  return (
    <span data-listing-status={status} className={`tone-dark type-tag inline-flex items-center gap-2 px-2.5 py-1.5 ${positionClass}`}>
      <span aria-hidden className={`size-2 rounded-full ${DOT_CLASSES[status]}`} />
      {LISTING_STATUS_LABELS[status]}
    </span>
  );
}
