"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { removeHomeworkFiles } from "@/lib/admin/homework/file-storage";
import { removePhotoFiles } from "@/lib/admin/photos/photo-storage";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { EDITOR_ROLES, OWNER_ROLES } from "@/lib/admin/require-admin";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import type { SessionClient } from "@/lib/supabase/server-client";

// The 30-day trash (Admin §7): editors move items to trash and restore them (Undo);
// only owners delete forever, which also removes the photo files.

const trashTargetSchema = z.object({
  table: z.enum(["listings", "listing_photos", "team_members", "closed_deals", "connections", "homework_items"]),
  id: z.uuid(),
});

export type TrashTarget = z.infer<typeof trashTargetSchema>;

const ADMIN_PATHS_TO_REFRESH = ["/admin/listings", "/admin/team", "/admin/connections", "/admin/homework", "/admin/trash", "/admin/closed-deals", "/admin/inbox"];

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
  if (table === "closed_deals") return [];
  if (table === "listings") {
    const { data } = await supabase.from("listing_photos").select("storage_path").eq("listing_id", id);
    return (data ?? []).map((photo: { storage_path: string }) => photo.storage_path);
  }
  const portraitTable = table === "connections" || table === "homework_items" ? table : "team_members";
  const { data } = await supabase.from(portraitTable).select("photo_path").eq("id", id).maybeSingle<{ photo_path: string | null }>();
  return data?.photo_path ? [data.photo_path] : [];
}

// Homework videos, guides, and captions live in the cwr-files bucket, apart from photos.
async function fetchHomeworkFilePaths(supabase: SessionClient, { table, id }: TrashTarget): Promise<string[]> {
  if (table !== "homework_items") return [];
  const { data } = await supabase.from("homework_items").select("file_path, captions_path").eq("id", id).maybeSingle<{ file_path: string | null; captions_path: string | null }>();
  return [data?.file_path, data?.captions_path].filter((path): path is string => Boolean(path));
}

export async function deleteForeverAction(target: TrashTarget): Promise<QuickResult> {
  return runQuickAction(OWNER_ROLES, async ({ supabase, tenantId }) => {
    const parsed = trashTargetSchema.parse(target);
    const folders = await fetchPhotoFolders(supabase, parsed);
    const homeworkFiles = await fetchHomeworkFilePaths(supabase, parsed);
    const { error, count } = await supabase.from(parsed.table).delete({ count: "exact" }).eq("id", parsed.id).eq("tenant_id", tenantId).not("deleted_at", "is", null);
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!count) return getQuickError("Only items in the trash can be deleted forever.");
    // The record is gone either way; files that fail to delete are left to the nightly cleanup.
    await removePhotoFiles(folders).catch((fileError) => console.error("Photo files not removed after delete forever", fileError));
    await removeHomeworkFiles(homeworkFiles).catch((fileError) => console.error("Homework files not removed after delete forever", fileError));
    refreshAdminLists();
    return getQuickSuccess("Deleted forever.");
  });
}
