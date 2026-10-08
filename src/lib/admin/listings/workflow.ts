import type { ListingStatus } from "@/lib/content/listing-statuses";

// Status moves the database allows (cwr.install_default_workflows). The database is the
// authority; these only decide which buttons to show.

export type PublishState = "draft" | "live";

// Forward moves may skip steps; the back moves cover a deal falling through and fixing
// a mistake (owner choice 2026-10-02).
const STATUS_MOVES: Record<ListingStatus, ListingStatus[]> = {
  coming_soon: ["for_sale", "under_contract", "sold"],
  for_sale: ["coming_soon", "under_contract", "sold"],
  under_contract: ["for_sale", "sold"],
  sold: ["for_sale"],
};

export function getStatusMoves(status: ListingStatus): ListingStatus[] {
  return STATUS_MOVES[status];
}

export function canUndoStatusMove(from: ListingStatus, to: ListingStatus): boolean {
  return STATUS_MOVES[to].includes(from);
}
