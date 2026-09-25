import "server-only";

import type { AdminContext } from "@/lib/admin/require-admin";

// Everything soft-deleted in the last 30 days (cwr.trash view, the viewer's own access rules).

const MAX_TRASH_ROWS = 200;

export type TrashItem = {
  item_type: "listings" | "listing_photos" | "team_members";
  id: string;
  label: string;
  deleted_at: string;
  purge_after: string;
};

export async function fetchTrash({ supabase, tenantId }: AdminContext): Promise<TrashItem[]> {
  const { data } = await supabase
    .from("trash")
    .select("item_type, id, label, deleted_at, purge_after")
    .eq("tenant_id", tenantId)
    .order("deleted_at", { ascending: false })
    .limit(MAX_TRASH_ROWS)
    .returns<TrashItem[]>();
  return data ?? [];
}
