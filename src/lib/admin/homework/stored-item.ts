import "server-only";

import { getDatabaseProblemCause } from "@/lib/admin/database-errors";
import type { AdminContext } from "@/lib/admin/require-admin";
import { noteProblemCause } from "@/lib/observability/action-context";

// The saved state of one Homework item, read by server actions before they change it. A failed
// read is never shown as "no longer exists" (docs/cwr-error-tracking-plan.md, silent paths).

export const ITEM_NOT_FOUND_MESSAGE = "That item no longer exists. It may have been moved to the trash.";
const ITEM_LOAD_FAILED_MESSAGE = "We couldn't load this item. Try again in a moment.";

export type StoredItem = { kind: string; file_path: string | null; captions_path: string | null };

type ReadError = { code?: string; message: string };

export type StoredItemRead = { item: StoredItem | null; error: ReadError | null };

/** The live (not trashed) item; `item` is null only when the row is truly missing. */
export async function fetchStoredItem({ supabase, tenantId }: AdminContext, itemId: string): Promise<StoredItemRead> {
  const result = await supabase
    .from("homework_items")
    .select("kind, file_path, captions_path")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle<StoredItem>();
  return { item: result.data, error: result.error };
}

/** Notes the failed read as the action's cause and returns the message to show. */
export function getItemLoadErrorMessage(error: ReadError): string {
  noteProblemCause(getDatabaseProblemCause(error));
  return ITEM_LOAD_FAILED_MESSAGE;
}
