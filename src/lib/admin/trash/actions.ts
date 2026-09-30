"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { removeHomeworkFiles } from "@/lib/admin/homework/file-storage";
import { PhotoStorageError, removePhotoFiles } from "@/lib/admin/photos/photo-storage";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { EDITOR_ROLES, OWNER_ROLES } from "@/lib/admin/require-admin";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { getReferenceSuffix } from "@/lib/observability/reference";
import { reportProblem } from "@/lib/observability/report-problem";
import type { SessionClient } from "@/lib/supabase/server-client";

// The 30-day trash (Admin §7): editors move items to trash and restore them (Undo);
// only owners delete forever, which also removes the photo files.

const trashTargetSchema = z.object({
  table: z.enum(["listings", "listing_photos", "team_members", "closed_deals", "connections", "homework_items"]),
  id: z.uuid(),
});

export type TrashTarget = z.infer<typeof trashTargetSchema>;

const ADMIN_PATHS_TO_REFRESH = ["/admin/listings", "/admin/team", "/admin/connections", "/admin/homework", "/admin/trash", "/admin/closed-deals", "/admin/inbox"];
const DELETE_FOREVER_ACTION: ProblemAction = "trash.delete_forever";
const FILES_LEFT_CODE = "files_left_behind";
const FILES_LEFT_MESSAGE = "Some of its files may still be in storage";

type ReadError = { code?: string; message: string };

/** Stored files that belong to a record; `error` set when they couldn't be looked up. */
type FileLookup = { paths: string[]; error: ReadError | null };

const NO_FILES: FileLookup = { paths: [], error: null };

function refreshAdminLists(): void {
  ADMIN_PATHS_TO_REFRESH.forEach((path) => revalidatePath(path, "layout"));
}

async function setDeletedAt({ action, target, deletedAt }: { action: ProblemAction; target: TrashTarget; deletedAt: string | null }): Promise<QuickResult> {
  return runQuickAction({ action, roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const { table, id } = trashTargetSchema.parse(target);
    const { data: updated, error } = await supabase.from(table).update({ deleted_at: deletedAt }).eq("id", id).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError("That item no longer exists.");
    refreshAdminLists();
    return getQuickSuccess(deletedAt ? "Moved to trash. It stays there for 30 days." : "Restored.");
  });
}

export async function moveToTrashAction(target: TrashTarget): Promise<QuickResult> {
  return setDeletedAt({ action: "trash.move_to_trash", target, deletedAt: new Date().toISOString() });
}

export async function restoreFromTrashAction(target: TrashTarget): Promise<QuickResult> {
  return setDeletedAt({ action: "trash.restore", target, deletedAt: null });
}

async function fetchListingPhotoFolder(supabase: SessionClient, id: string): Promise<FileLookup> {
  const result = await supabase.from("listing_photos").select("storage_path").eq("id", id).maybeSingle<{ storage_path: string }>();
  return { paths: result.data ? [result.data.storage_path] : [], error: result.error };
}

async function fetchListingFolders(supabase: SessionClient, id: string): Promise<FileLookup> {
  const result = await supabase.from("listing_photos").select("storage_path").eq("listing_id", id);
  return { paths: (result.data ?? []).map((photo: { storage_path: string }) => photo.storage_path), error: result.error };
}

async function fetchPortraitFolder(supabase: SessionClient, { table, id }: TrashTarget): Promise<FileLookup> {
  const portraitTable = table === "connections" || table === "homework_items" ? table : "team_members";
  const result = await supabase.from(portraitTable).select("photo_path").eq("id", id).maybeSingle<{ photo_path: string | null }>();
  return { paths: result.data?.photo_path ? [result.data.photo_path] : [], error: result.error };
}

async function fetchPhotoFolders(supabase: SessionClient, target: TrashTarget): Promise<FileLookup> {
  if (target.table === "closed_deals") return NO_FILES;
  if (target.table === "listing_photos") return fetchListingPhotoFolder(supabase, target.id);
  if (target.table === "listings") return fetchListingFolders(supabase, target.id);
  return fetchPortraitFolder(supabase, target);
}

// Homework videos, guides, and captions live in the cwr-files bucket, apart from photos.
async function fetchHomeworkFilePaths(supabase: SessionClient, { table, id }: TrashTarget): Promise<FileLookup> {
  if (table !== "homework_items") return NO_FILES;
  const result = await supabase.from("homework_items").select("file_path, captions_path").eq("id", id).maybeSingle<{ file_path: string | null; captions_path: string | null }>();
  return { paths: [result.data?.file_path, result.data?.captions_path].filter((path): path is string => Boolean(path)), error: result.error };
}

function getLookupProblem({ label, lookup }: { label: string; lookup: FileLookup }): string | null {
  return lookup.error ? `${label} not looked up: ${lookup.error.code ?? ""} ${lookup.error.message}`.trim() : null;
}

function getPhotoErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error instanceof PhotoStorageError ? error.context.cause : undefined;
  return cause instanceof Error ? `${error.message}: ${cause.message}` : error.message;
}

// Boundary around the photo storage call, which throws; the record is already gone either way.
async function getPhotoRemovalProblem(folders: string[]): Promise<string | null> {
  try {
    await removePhotoFiles(folders);
    return null;
  } catch (error) {
    return `Photo files not removed: ${getPhotoErrorDetail(error)}`;
  }
}

/** Removes the deleted record's files; returns a line for each set that may be left in storage. */
async function removeRecordFiles({ folders, homeworkFiles }: { folders: FileLookup; homeworkFiles: FileLookup }): Promise<string[]> {
  const photoProblem = await getPhotoRemovalProblem(folders.paths);
  const homeworkFailure = await removeHomeworkFiles(homeworkFiles.paths);
  const problems = [
    getLookupProblem({ label: "Photo folders", lookup: folders }),
    getLookupProblem({ label: "Homework files", lookup: homeworkFiles }),
    photoProblem,
    homeworkFailure ? `Homework files not removed: ${homeworkFailure.code} ${homeworkFailure.detail}` : null,
  ];
  return problems.filter((problem): problem is string => problem !== null);
}

// Files left behind are removed by the nightly cleanup; the owner still gets a reference.
async function getFilesLeftNote({ target, problems }: { target: TrashTarget; problems: string[] }): Promise<string> {
  if (problems.length === 0) return "";
  const result = await reportProblem({
    action: DELETE_FOREVER_ACTION,
    stage: "storage",
    severity: "warning",
    code: FILES_LEFT_CODE,
    detail: problems.join("\n"),
    shownMessage: FILES_LEFT_MESSAGE,
    recordTable: target.table,
    recordId: target.id,
  });
  return ` ${FILES_LEFT_MESSAGE}${getReferenceSuffix({ reference: result.reference, isStored: result.stored === true })}.`;
}

export async function deleteForeverAction(target: TrashTarget): Promise<QuickResult> {
  return runQuickAction({ action: DELETE_FOREVER_ACTION, roles: OWNER_ROLES }, async ({ supabase, tenantId }) => {
    const parsed = trashTargetSchema.parse(target);
    const [folders, homeworkFiles] = await Promise.all([fetchPhotoFolders(supabase, parsed), fetchHomeworkFilePaths(supabase, parsed)]);
    const { error, count } = await supabase.from(parsed.table).delete({ count: "exact" }).eq("id", parsed.id).eq("tenant_id", tenantId).not("deleted_at", "is", null);
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!count) return getQuickError("Only items in the trash can be deleted forever.");
    refreshAdminLists();
    const problems = await removeRecordFiles({ folders, homeworkFiles });
    return getQuickSuccess(`Deleted forever.${await getFilesLeftNote({ target: parsed, problems })}`);
  });
}
