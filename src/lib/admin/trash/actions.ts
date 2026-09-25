"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { removePhotoFiles } from "@/lib/admin/photos/photo-storage";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { EDITOR_ROLES, OWNER_ROLES } from "@/lib/admin/require-admin";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import type { SessionClient } from "@/lib/supabase/server-client";

// The 30-day trash (Admin §7): editors move items to trash and restore them (Undo);
// only owners delete forever, which also removes the photo files.

const trashTargetSchema = z.object({
  table: z.enum(["listings", "listing_photos", "team_members"]),
  id: z.uuid(),
});

export type TrashTarget = z.infer<typeof trashTargetSchema>;

const ADMIN_PATHS_TO_REFRESH = ["/admin/listings", "/admin/team", "/admin/trash"];

function refreshAdminLists(): void {
  ADMIN_PATHS_TO_REFRESH.forEach((path) => revalidatePath(path, "layout"));
}

async function setDeletedAt(target: TrashTarget, deletedAt: string | null): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const { table, id } = trashTargetSchema.parse(target);
    const { data: updated, error } = await supabase.from(table).update({ deleted_at: deletedAt }).eq("id", id).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError("That item no longer exists.");
    refreshAdminLists();
    return getQuickSuccess(deletedAt ? "Moved to trash. It stays there for 30 days." : "Restored.");
  });
}

export async function moveToTrashAction(target: TrashTarget): Promise<QuickResult> {
  return setDeletedAt(target, new Date().toISOString());
}

export async function restoreFromTrashAction(target: TrashTarget): Promise<QuickResult> {
  return setDeletedAt(target, null);
}

async function fetchPhotoFolders(supabase: SessionClient, { table, id }: TrashTarget): Promise<string[]> {
  if (table === "listing_photos") {
    const { data } = await supabase.from("listing_photos").select("storage_path").eq("id", id).maybeSingle<{ storage_path: string }>();
    return data ? [data.storage_path] : [];
  }
  if (table === "listings") {
    const { data } = await supabase.from("listing_photos").select("storage_path").eq("listing_id", id);
    return (data ?? []).map((photo: { storage_path: string }) => photo.storage_path);
  }
  const { data } = await supabase.from("team_members").select("photo_path").eq("id", id).maybeSingle<{ photo_path: string | null }>();
  return data?.photo_path ? [data.photo_path] : [];
}

export async function deleteForeverAction(target: TrashTarget): Promise<QuickResult> {
  return runQuickAction(OWNER_ROLES, async ({ supabase, tenantId }) => {
    const parsed = trashTargetSchema.parse(target);
    const folders = await fetchPhotoFolders(supabase, parsed);
    const { error, count } = await supabase.from(parsed.table).delete({ count: "exact" }).eq("id", parsed.id).eq("tenant_id", tenantId).not("deleted_at", "is", null);
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!count) return getQuickError("Only items in the trash can be deleted forever.");
    // The record is gone either way; files that fail to delete are left to the nightly cleanup.
    await removePhotoFiles(folders).catch((fileError) => console.error("Photo files not removed after delete forever", fileError));
    refreshAdminLists();
    return getQuickSuccess("Deleted forever.");
  });
}
