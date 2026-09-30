"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import {
  HomeworkStorageError,
  createSignedFileUpload,
  fetchCaptionsCheck,
  fetchStoredFileInfo,
  getStorageProblemCause,
  removeHomeworkFiles,
  type StorageFailure,
  type StoredFileInfo,
} from "@/lib/admin/homework/file-storage";
import { getStorageFileName } from "@/lib/admin/homework/homework-schema";
import { ITEM_NOT_FOUND_MESSAGE, fetchStoredItem, getItemLoadErrorMessage, type StoredItem } from "@/lib/admin/homework/stored-item";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { getAlreadyReportedCause, getReportedFailureMessage, getUnexpectedCause } from "@/lib/admin/report-action-failure";
import { AdminAccessError, EDITOR_ROLES, requireAdmin, type AdminContext } from "@/lib/admin/require-admin";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { UPLOAD_LIMIT_BYTES, getUploadFormat, getUploadProblem, type UploadPurpose } from "@/lib/content/homework-rules";
import { noteProblemCause, runInActionContext, type ProblemCause } from "@/lib/observability/action-context";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { reportProblem } from "@/lib/observability/report-problem";
import { ReportedProblemError } from "@/lib/observability/reported-problem-error";

// Homework file uploads (owner approval 2026-09-27). Step 1: check the editor, the item,
// and the file, then hand out a one-time upload link, so large videos go from the browser
// straight to storage. Step 2: confirm the file arrived and record it on the item.
// Every problem is recorded; a storage failure is never shown as a problem with the file.

const HOMEWORK_ADMIN_PATH = "/admin/homework";
const HOMEWORK_PAGE_PATH = "/resources";
const MAX_VIDEO_SECONDS = 4 * 60 * 60;
const REQUEST_UPLOAD_ACTION: ProblemAction = "homework.request_upload_link";
const SAVE_FILE_ACTION: ProblemAction = "homework.save_file";
const FILE_REJECTED_CODE = "file_rejected";
const UPLOADS_UNAVAILABLE_MESSAGE = "Uploads aren't working right now. Try again in a moment.";
const UPLOAD_CHECK_FAILED_MESSAGE = "We couldn't check the upload. Try again in a moment.";
// The wrapper appends " (Ref …)", which completes the sentence.
const CAPTIONS_CHECK_FAILED_MESSAGE = "We couldn't check the captions file. Try again";
const NOT_CAPTIONS_MESSAGE = "That isn't a captions file. Choose a WebVTT file that starts with WEBVTT.";

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

type TicketRequest = z.infer<typeof ticketRequestSchema>;

type SavedFile = z.infer<typeof savedFileSchema>;

type UploadFormat = NonNullable<ReturnType<typeof getUploadFormat>>;

function refreshHomeworkPages(): void {
  revalidatePath(HOMEWORK_ADMIN_PATH, "layout");
  revalidatePath(HOMEWORK_PAGE_PATH);
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

function getTicketError(message: string): UploadTicket {
  return { status: "error", message };
}

function getRejectedFileTicket({ message, detail }: { message: string; detail: string }): UploadTicket {
  noteProblemCause({ stage: "validate", severity: "info", code: FILE_REJECTED_CODE, detail });
  return getTicketError(message);
}

function getThrownTicketCause(error: unknown): ProblemCause {
  if (error instanceof ReportedProblemError) return getAlreadyReportedCause(error);
  if (error instanceof AdminAccessError) return { stage: "access", severity: "warning", code: "wrong_role", detail: null };
  if (error instanceof HomeworkStorageError) return getStorageProblemCause(error.context.failure);
  return getUnexpectedCause(error);
}

function getThrownTicketMessage(error: unknown): string {
  if (error instanceof ReportedProblemError || error instanceof AdminAccessError) return error.message;
  return UPLOADS_UNAVAILABLE_MESSAGE;
}

async function getReadyTicket({ itemId, purpose, fileName }: TicketRequest): Promise<UploadTicket> {
  const path = `homework/${itemId}/${crypto.randomUUID()}/${getStorageFileName(fileName)}`;
  const contentType = getUploadFormat(purpose, fileName)?.mime ?? "";
  return { status: "ready", path, signedUrl: await createSignedFileUpload(path), contentType };
}

async function getUploadTicket(input: z.input<typeof ticketRequestSchema>): Promise<UploadTicket> {
  const admin = await requireAdmin(EDITOR_ROLES);
  const parsed = ticketRequestSchema.safeParse(input);
  if (!parsed.success) return getTicketError("Choose the file again.");
  const problem = getUploadProblem(parsed.data);
  if (problem) return getRejectedFileTicket({ message: problem, detail: `${parsed.data.purpose}, ${parsed.data.sizeBytes} bytes` });
  const { item, error } = await fetchStoredItem(admin, parsed.data.itemId);
  if (error) return getTicketError(getItemLoadErrorMessage(error));
  if (!item || item.kind !== PURPOSE_KINDS[parsed.data.purpose]) return getTicketError(ITEM_NOT_FOUND_MESSAGE);
  return getReadyTicket(parsed.data);
}

// Boundary for the ticket step: anything thrown becomes a plain message with its cause noted.
async function getCheckedTicket(input: z.input<typeof ticketRequestSchema>): Promise<UploadTicket> {
  try {
    return await getUploadTicket(input);
  } catch (error) {
    unstable_rethrow(error);
    noteProblemCause(getThrownTicketCause(error));
    return getTicketError(getThrownTicketMessage(error));
  }
}

// Not wrapped by runQuickAction because the browser needs the ticket itself; every error it
// returns is still recorded, with a reference code when it is worth quoting.
export async function requestHomeworkUploadAction(input: z.input<typeof ticketRequestSchema>): Promise<UploadTicket> {
  return runInActionContext(REQUEST_UPLOAD_ACTION, async () => {
    const ticket = await getCheckedTicket(input);
    if (ticket.status === "ready") return ticket;
    return getTicketError(await getReportedFailureMessage({ action: REQUEST_UPLOAD_ACTION, message: ticket.message, hasFieldErrors: false }));
  });
}

function getStorageFailureResult(failure: StorageFailure, message: string): QuickResult {
  noteProblemCause(getStorageProblemCause(failure));
  return getQuickError(message);
}

// A rejected file that can't be removed is left for the nightly cleanup; recorded, not shown.
async function removeRejectedFile({ itemId, path }: { itemId: string; path: string }): Promise<void> {
  const failure = await removeHomeworkFiles([path]);
  if (!failure) return;
  await reportProblem({
    action: SAVE_FILE_ACTION,
    stage: "storage",
    severity: "warning",
    code: failure.code,
    detail: `Rejected file not removed (${path}): ${failure.detail}`,
    recordTable: "homework_items",
    recordId: itemId,
  });
}

async function rejectStoredFile({ itemId, path, message, detail }: { itemId: string; path: string; message: string; detail: string }): Promise<QuickResult> {
  await removeRejectedFile({ itemId, path });
  noteProblemCause({ stage: "validate", severity: "info", code: FILE_REJECTED_CODE, detail });
  return getQuickError(message);
}

async function saveCaptions(admin: AdminContext, { itemId, path }: { itemId: string; path: string }): Promise<QuickResult> {
  const check = await fetchCaptionsCheck(path);
  // A failed download keeps the upload: the file may be fine, and the editor can try again.
  if (check.status === "failed") return getStorageFailureResult(check.failure, CAPTIONS_CHECK_FAILED_MESSAGE);
  if (check.status === "not_captions") return rejectStoredFile({ itemId, path, message: NOT_CAPTIONS_MESSAGE, detail: "No WEBVTT signature" });
  const { error } = await admin.supabase.from("homework_items").update({ captions_path: path }).eq("id", itemId).eq("tenant_id", admin.tenantId);
  if (error) return getQuickError(getDatabaseErrorMessage(error));
  refreshHomeworkPages();
  return getQuickSuccess("Captions saved. Visitors can turn them on in the video player.");
}

async function saveMainFile(admin: AdminContext, { item, upload, stored, format }: { item: StoredItem; upload: SavedFile; stored: StoredFileInfo; format: UploadFormat }): Promise<QuickResult> {
  const isFirstFile = item.file_path === null;
  const displayName = getDisplayName({ fileName: upload.fileName, path: upload.path, extension: format.extensions[0] ?? "" });
  const columns = getFileColumns({ purpose: upload.purpose, fileName: displayName, mime: format.mime, sizeBytes: stored.sizeBytes, durationSeconds: upload.durationSeconds });
  const update = { file_path: upload.path, ...columns, ...(isFirstFile ? { is_visible: true } : {}) };
  const { error } = await admin.supabase.from("homework_items").update(update).eq("id", upload.itemId).eq("tenant_id", admin.tenantId);
  if (error) return getQuickError(getDatabaseErrorMessage(error));
  refreshHomeworkPages();
  // A replaced file is no longer used; the nightly cleanup removes it from storage.
  return getQuickSuccess(isFirstFile ? "Uploaded and shown on the Homework page." : "File replaced. The Homework page uses the new file now.");
}

async function saveCheckedFile(admin: AdminContext, { item, upload, stored }: { item: StoredItem; upload: SavedFile; stored: StoredFileInfo }): Promise<QuickResult> {
  const { itemId, purpose, path } = upload;
  const format = getUploadFormat(purpose, getStoredName(path));
  const detail = `${purpose}, ${stored.mime || "no type"}, ${stored.sizeBytes} bytes`;
  if (!format || stored.mime !== format.mime) return rejectStoredFile({ itemId, path, message: "That file type isn't accepted here. Choose the file again.", detail });
  if (stored.sizeBytes > UPLOAD_LIMIT_BYTES[purpose]) return rejectStoredFile({ itemId, path, message: "That file is too large. Choose a smaller file.", detail });
  if (purpose === "captions") return saveCaptions(admin, { itemId, path });
  return saveMainFile(admin, { item, upload, stored, format });
}

export async function saveHomeworkFileAction(input: z.input<typeof savedFileSchema>): Promise<QuickResult> {
  return runQuickAction({ action: SAVE_FILE_ACTION, roles: EDITOR_ROLES }, async (admin) => {
    const parsed = savedFileSchema.safeParse(input);
    if (!parsed.success) return getQuickError("The upload details were incomplete. Try again.");
    const { itemId, purpose, path } = parsed.data;
    if (!path.startsWith(`homework/${itemId}/`)) return getQuickError("That file belongs to another item.");
    const { item, error } = await fetchStoredItem(admin, itemId);
    if (error) return getQuickError(getItemLoadErrorMessage(error));
    if (!item || item.kind !== PURPOSE_KINDS[purpose]) return getQuickError(ITEM_NOT_FOUND_MESSAGE);
    const check = await fetchStoredFileInfo(path);
    if (check.status === "failed") return getStorageFailureResult(check.failure, UPLOAD_CHECK_FAILED_MESSAGE);
    if (check.status === "missing") return getQuickError("The file didn't finish uploading. Try again.");
    return saveCheckedFile(admin, { item, upload: parsed.data, stored: check.file });
  });
}

export async function removeHomeworkCaptionsAction(itemId: string): Promise<QuickResult> {
  return runQuickAction({ action: "homework.remove_captions", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const { data: updated, error } = await supabase.from("homework_items").update({ captions_path: null }).eq("id", z.uuid().parse(itemId)).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError(ITEM_NOT_FOUND_MESSAGE);
    refreshHomeworkPages();
    return getQuickSuccess("Captions removed.");
  });
}
