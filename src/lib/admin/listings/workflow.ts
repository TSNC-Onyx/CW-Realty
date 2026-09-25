import type { ListingStatus } from "@/lib/content/listings";

// Status moves the database allows (cwr.install_default_workflows). The database is the
// authority; these only decide which buttons to show.

export type PublishState = "draft" | "live";

export const STATUS_LABELS: Record<ListingStatus, string> = { active: "Active", pending: "Pending", sold: "Sold" };

const STATUS_MOVES: Record<ListingStatus, ListingStatus[]> = {
  active: ["pending", "sold"],
  pending: ["active", "sold"],
  sold: ["active"],
};

export function getStatusMoves(status: ListingStatus): ListingStatus[] {
  return STATUS_MOVES[status];
}

export function canUndoStatusMove(from: ListingStatus, to: ListingStatus): boolean {
  return STATUS_MOVES[to].includes(from);
}
