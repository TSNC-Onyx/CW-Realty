"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { createSignedFileUpload, fetchStoredFileInfo, isWebVttFile, removeHomeworkFiles } from "@/lib/admin/homework/file-storage";
import { getStorageFileName } from "@/lib/admin/homework/homework-schema";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { AdminAccessError, EDITOR_ROLES, requireAdmin, type AdminContext } from "@/lib/admin/require-admin";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { UPLOAD_LIMIT_BYTES, getUploadFormat, getUploadProblem, type UploadPurpose } from "@/lib/content/homework-rules";

// Homework file uploads (owner approval 2026-09-27). Step 1: check the editor, the item,
// and the file, then hand out a one-time upload link, so large videos go from the browser
// straight to storage. Step 2: confirm the file arrived and record it on the item.

const HOMEWORK_ADMIN_PATH = "/admin/homework";
const HOMEWORK_PAGE_PATH = "/resources";
const MAX_VIDEO_SECONDS = 4 * 60 * 60;
const NOT_FOUND_MESSAGE = "That item no longer exists. It may have been moved to the trash.";

const PURPOSES = ["video", "document", "captions"] as const;

// Which kind of item accepts each purpose.
const PURPOSE_KINDS: Record<UploadPurpose, string> = { video: "video", document: "file", captions: "video" };

const ticketRequestSchema = z.object({
  itemId: z.uuid(),
  purpose: z.enum(PURPOSES),
  fileName: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().nonnegative(),
});

const savedFileSchema = z.object({
  itemId: z.uuid(),
  purpose: z.enum(PURPOSES),
  path: z.string().regex(/^homework\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9-]+\.[a-z0-9]+$/),
  fileName: z.string().trim().min(1).max(200),
  durationSeconds: z.number().positive().max(MAX_VIDEO_SECONDS).nullable(),
});

export type UploadTicket = { status: "ready"; path: string; signedUrl: string; contentType: string } | { status: "error"; message: string };

type StoredItem = { kind: string; file_path: string | null; captions_path: string | null };

function refreshHomeworkPages(): void {
  revalidatePath(HOMEWORK_ADMIN_PATH, "layout");
  revalidatePath(HOMEWORK_PAGE_PATH);
}

async function fetchStoredItem({ supabase, tenantId }: AdminContext, itemId: string): Promise<StoredItem | null> {
  const { data } = await supabase
    .from("homework_items")
    .select("kind, file_path, captions_path")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle<StoredItem>();
  return data;
}

function getStoredName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

// The visitor-facing name keeps the editor's wording but always ends in the stored file's extension.
function getDisplayName({ fileName, path, extension }: { fileName: string; path: string; extension: string }): string {
  return fileName.toLowerCase().endsWith(`.${extension}`) ? fileName : getStoredName(path);
}

function getFileColumns({ purpose, fileName, mime, sizeBytes, durationSeconds }: { purpose: UploadPurpose; fileName: string; mime: string; sizeBytes: number; durationSeconds: number | null }) {
  // A replacement video's length is always rewritten, so an old length never outlives its file.
  const duration = purpose === "video" ? { duration_seconds: durationSeconds ? Math.round(durationSeconds) : null } : {};
  return { file_name: fileName, file_mime: mime, file_size_bytes: sizeBytes, ...duration };
}

export async function requestHomeworkUploadAction(input: z.input<typeof ticketRequestSchema>): Promise<UploadTicket> {
  const parsed = ticketRequestSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Choose the file again." };
  const problem = getUploadProblem(parsed.data);
  if (problem) return { status: "error", message: problem };
  try {
    const admin = await requireAdmin(EDITOR_ROLES);
    const item = await fetchStoredItem(admin, parsed.data.itemId);
    if (!item || item.kind !== PURPOSE_KINDS[parsed.data.purpose]) return { status: "error", message: NOT_FOUND_MESSAGE };
    const path = `homework/${parsed.data.itemId}/${crypto.randomUUID()}/${getStorageFileName(parsed.data.fileName)}`;
    const contentType = getUploadFormat(parsed.data.purpose, parsed.data.fileName)?.mime ?? "";
    return { status: "ready", path, signedUrl: await createSignedFileUpload(path), contentType };
  } catch (error) {
    if (error instanceof AdminAccessError) return { status: "error", message: error.message };
    console.error("Homework upload link failed", error);
    return { status: "error", message: "Uploads aren't working right now. Try again in a moment." };
  }
}

export async function saveHomeworkFileAction(input: z.input<typeof savedFileSchema>): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async (admin) => {
    const parsed = savedFileSchema.safeParse(input);
    if (!parsed.success) return getQuickError("The upload details were incomplete. Try again.");
    const { itemId, purpose, path, fileName, durationSeconds } = parsed.data;
    if (!path.startsWith(`homework/${itemId}/`)) return getQuickError("That file belongs to another item.");
    const item = await fetchStoredItem(admin, itemId);
    if (!item || item.kind !== PURPOSE_KINDS[purpose]) return getQuickError(NOT_FOUND_MESSAGE);
    const format = getUploadFormat(purpose, getStoredName(path));
    const stored = await fetchStoredFileInfo(path);
    if (!stored) return getQuickError("The file didn't finish uploading. Try again.");
    if (!format || stored.mime !== format.mime) return rejectStoredFile(path, "That file type isn't accepted here. Choose the file again.");
    if (stored.sizeBytes > UPLOAD_LIMIT_BYTES[purpose]) return rejectStoredFile(path, "That file is too large. Choose a smaller file.");
    if (purpose === "captions") return saveCaptions(admin, { itemId, path });
    const isFirstFile = item.file_path === null;
    const displayName = getDisplayName({ fileName, path, extension: format.extensions[0] ?? "" });
    const columns = getFileColumns({ purpose, fileName: displayName, mime: format.mime, sizeBytes: stored.sizeBytes, durationSeconds });
    const update = { file_path: path, ...columns, ...(isFirstFile ? { is_visible: true } : {}) };
    const { error } = await admin.supabase.from("homework_items").update(update).eq("id", itemId).eq("tenant_id", admin.tenantId);
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshHomeworkPages();
    // A replaced file is no longer used; the nightly cleanup removes it from storage.
    return getQuickSuccess(isFirstFile ? "Uploaded and shown on the Homework page." : "File replaced. The Homework page uses the new file now.");
  });
}

async function rejectStoredFile(path: string, message: string): Promise<QuickResult> {
  await removeHomeworkFiles([path]).catch((error) => console.error("Rejected Homework file not removed", error));
  return getQuickError(message);
}

async function saveCaptions(admin: AdminContext, { itemId, path }: { itemId: string; path: string }): Promise<QuickResult> {
  if (!(await isWebVttFile(path))) return rejectStoredFile(path, "That isn't a captions file. Choose a WebVTT file that starts with WEBVTT.");
  const { error } = await admin.supabase.from("homework_items").update({ captions_path: path }).eq("id", itemId).eq("tenant_id", admin.tenantId);
  if (error) return getQuickError(getDatabaseErrorMessage(error));
  refreshHomeworkPages();
  return getQuickSuccess("Captions saved. Visitors can turn them on in the video player.");
}

export async function removeHomeworkCaptionsAction(itemId: string): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const { data: updated, error } = await supabase.from("homework_items").update({ captions_path: null }).eq("id", z.uuid().parse(itemId)).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError(NOT_FOUND_MESSAGE);
    refreshHomeworkPages();
    return getQuickSuccess("Captions removed.");
  });
}
