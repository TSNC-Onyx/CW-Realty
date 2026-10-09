// Listing statuses: same values and order as the cwr.listing_status enum, which is also
// the order visitors see on /listings (owner choice 2026-10-02). No server imports, so
// browser components can use the labels.

export const LISTING_STATUSES = ["coming_soon", "for_sale", "under_contract", "sold"] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  coming_soon: "Coming Soon",
  for_sale: "For Sale",
  under_contract: "Under Contract",
  sold: "Sold",
};
