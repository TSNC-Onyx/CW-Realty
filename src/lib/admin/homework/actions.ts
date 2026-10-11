"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCreatedState, getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { getFieldErrorsFromZod } from "@/lib/admin/auth-schemas";
import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { downloadDetailsSchema, getDownloadRow, getVideoRow, videoDetailsSchema } from "@/lib/admin/homework/homework-schema";
import { ITEM_NOT_FOUND_MESSAGE, fetchStoredItem, getItemLoadErrorMessage } from "@/lib/admin/homework/stored-item";
import { runOnce } from "@/lib/admin/idempotency";
import { fetchPhotoFilesCheck, getPhotoFilesMessage } from "@/lib/admin/photos/photo-storage";
import { MAX_ALT_TEXT_LENGTH } from "@/lib/admin/photos/photo-files";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { EDITOR_ROLES, type AdminContext } from "@/lib/admin/require-admin";
import { runAdminAction } from "@/lib/admin/run-admin-action";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { noteProblemCause } from "@/lib/observability/action-context";

// Admin → Homework details, order, visibility, and cover pictures (owner approval
// 2026-09-27). File uploads live in upload-actions.ts.

const HOMEWORK_ADMIN_PATH = "/admin/homework";
const HOMEWORK_PAGE_PATH = "/resources";
const NEEDS_FILE_MESSAGE = "Upload the file first. Visitors only see items they can open.";
// New items start at the end of their list; cwr.move_homework_item renumbers on the first move.
const NEW_ITEM_SORT_ORDER = 9999;

const coverSchema = z.object({
  itemId: z.uuid(),
  folder: z.string().regex(/^homework\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().trim().min(1, "Describe the picture").max(MAX_ALT_TEXT_LENGTH),
});
const videoCoverSchema = coverSchema.omit({ alt: true });
// Automatic covers (docs/cwr-video-auto-cover-plan.md): the description stays true if the title changes.
const VIDEO_COVER_ALT = "Opening scene of this video";
const VIDEO_COVER_MADE_MESSAGE = "Cover picture made from the video's opening scene. You can replace it below.";
const UPLOADED_COVER_KEPT_MESSAGE = "Your own cover picture was kept.";
// Matches only items without a cover or with an automatic one, so an uploaded cover is never replaced.
const REPLACEABLE_COVER_FILTER = "photo_path.is.null,is_photo_from_video.eq.true";

type CreateResult = { id: string } | { error: { code?: string; message: string } };

function refreshHomeworkPages(): void {
  revalidatePath(HOMEWORK_ADMIN_PATH, "layout");
  revalidatePath(HOMEWORK_PAGE_PATH);
}

// A malformed item id can only come from a stale page or a tampered request.
function getStaleItemState(): ActionState {
  noteProblemCause({ stage: "validate", severity: "warning", code: "item_id", detail: null });
  return getErrorState({ message: ITEM_NOT_FOUND_MESSAGE });
}

async function insertItem(admin: AdminContext, { key, row }: { key: string; row: Record<string, unknown> }): Promise<CreateResult> {
  return runOnce<CreateResult>({
    tenantId: admin.tenantId,
    scope: "homework_items.create",
    key,
    requestBody: JSON.stringify(row),
    run: async () => {
      const { data, error } = await admin.supabase.from("homework_items").insert({ tenant_id: admin.tenantId, ...row, sort_order: NEW_ITEM_SORT_ORDER }).select("id").single();
      return error ? { error: { code: error.code, message: error.message } } : { id: data.id as string };
    },
  });
}

// New videos and file downloads stay hidden until their file is uploaded (the upload shows them).
export async function createHomeworkVideoAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction({ action: "homework.create_video", roles: EDITOR_ROLES }, async (admin) => {
    const values = getFormValues(formData);
    const parsed = videoDetailsSchema.safeParse(values);
    if (!parsed.success) return getErrorState({ message: "Fix the highlighted fields.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
    const created = await insertItem(admin, { key: values.idempotencyKey ?? "", row: { kind: "video", ...getVideoRow(parsed.data), is_visible: false } });
    if ("error" in created) return getErrorState({ message: getDatabaseErrorMessage(created.error), values });
    refreshHomeworkPages();
    // The page uploads the chosen files to the new item, then opens it.
    return getCreatedState("Saved.", created.id);
  });
}

export async function createHomeworkDownloadAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction({ action: "homework.create_download", roles: EDITOR_ROLES }, async (admin) => {
    const values = getFormValues(formData);
    const parsed = downloadDetailsSchema.safeParse(values);
    if (!parsed.success) return getErrorState({ message: "Fix the highlighted fields.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
    const isLink = parsed.data.delivery === "link";
    const row = { ...getDownloadRow(parsed.data), is_visible: isLink && parsed.data.isVisible };
    const created = await insertItem(admin, { key: values.idempotencyKey ?? "", row });
    if ("error" in created) return getErrorState({ message: getDatabaseErrorMessage(created.error), values });
    refreshHomeworkPages();
    redirect(`${HOMEWORK_ADMIN_PATH}/${created.id}?created=1`);
  });
}

export async function updateHomeworkVideoAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction({ action: "homework.update_video", roles: EDITOR_ROLES }, async (admin) => {
    const values = getFormValues(formData);
    const itemId = z.uuid().safeParse(values.itemId);
    const parsed = videoDetailsSchema.safeParse(values);
    if (!itemId.success) return getStaleItemState();
    if (!parsed.success) return getErrorState({ message: "Fix the highlighted fields.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
    const { item: stored, error: readError } = await fetchStoredItem(admin, itemId.data);
    if (readError) return getErrorState({ message: getItemLoadErrorMessage(readError), values });
    if (!stored) return getErrorState({ message: ITEM_NOT_FOUND_MESSAGE, values });
    if (parsed.data.isVisible && !stored.file_path) return getErrorState({ message: NEEDS_FILE_MESSAGE, values });
    const { error } = await admin.supabase.from("homework_items").update({ ...getVideoRow(parsed.data), is_visible: parsed.data.isVisible }).eq("id", itemId.data).eq("tenant_id", admin.tenantId);
    if (error) return getErrorState({ message: getDatabaseErrorMessage(error), values });
    refreshHomeworkPages();
    return getSuccessState("Saved. The Homework page shows the changes now.");
  });
}

// Switching a download to a link drops its file (the nightly cleanup removes the stored copy);
// switching a link to a file hides it until a file is uploaded.
export async function updateHomeworkDownloadAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction({ action: "homework.update_download", roles: EDITOR_ROLES }, async (admin) => {
    const values = getFormValues(formData);
    const itemId = z.uuid().safeParse(values.itemId);
    const parsed = downloadDetailsSchema.safeParse(values);
    if (!itemId.success) return getStaleItemState();
    if (!parsed.success) return getErrorState({ message: "Fix the highlighted fields.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
    const { item: stored, error: readError } = await fetchStoredItem(admin, itemId.data);
    if (readError) return getErrorState({ message: getItemLoadErrorMessage(readError), values });
    if (!stored || stored.kind === "video") return getErrorState({ message: ITEM_NOT_FOUND_MESSAGE, values });
    const isLink = parsed.data.delivery === "link";
    const hasFile = !isLink && stored.kind === "file" && stored.file_path !== null;
    if (parsed.data.isVisible && !isLink && !hasFile) return getErrorState({ message: NEEDS_FILE_MESSAGE, values });
    const clearedFile = isLink || stored.kind === "link" ? { file_path: null, file_name: null, file_mime: null, file_size_bytes: null } : {};
    const update = { ...getDownloadRow(parsed.data), ...clearedFile, is_visible: parsed.data.isVisible };
    const { error } = await admin.supabase.from("homework_items").update(update).eq("id", itemId.data).eq("tenant_id", admin.tenantId);
    if (error) return getErrorState({ message: getDatabaseErrorMessage(error), values });
    refreshHomeworkPages();
    return getSuccessState("Saved. The Homework page shows the changes now.");
  });
}

export async function moveHomeworkItemAction(itemId: string, direction: "up" | "down"): Promise<QuickResult> {
  return runQuickAction({ action: "homework.move", roles: EDITOR_ROLES }, async ({ supabase }) => {
    const { error } = await supabase.rpc("move_homework_item", { p_id: z.uuid().parse(itemId), p_direction: direction });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshHomeworkPages();
    return getQuickSuccess(direction === "up" ? "Moved up." : "Moved down.");
  });
}

export async function setHomeworkVisibilityAction(itemId: string, isVisible: boolean): Promise<QuickResult> {
  return runQuickAction({ action: "homework.set_visibility", roles: EDITOR_ROLES }, async (admin) => {
    const id = z.uuid().parse(itemId);
    const { item: stored, error: readError } = await fetchStoredItem(admin, id);
    if (readError) return getQuickError(getItemLoadErrorMessage(readError));
    if (!stored) return getQuickError(ITEM_NOT_FOUND_MESSAGE);
    if (isVisible && stored.kind !== "link" && !stored.file_path) return getQuickError(NEEDS_FILE_MESSAGE);
    const { error } = await admin.supabase.from("homework_items").update({ is_visible: isVisible }).eq("id", id).eq("tenant_id", admin.tenantId);
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshHomeworkPages();
    return getQuickSuccess(isVisible ? "Shown on the Homework page." : "Hidden from the Homework page.");
  });
}

/** Why a cover's files can't be used, or null when they belong to this item and are all uploaded. */
async function fetchCoverFilesProblem({ itemId, folder }: { itemId: string; folder: string }): Promise<string | null> {
  if (!folder.startsWith(`homework/${itemId}/`)) return "That picture belongs to another item.";
  const filesCheck = await fetchPhotoFilesCheck(folder);
  return filesCheck === "complete" ? null : getPhotoFilesMessage(filesCheck);
}

export async function setHomeworkCoverAction(input: z.input<typeof coverSchema>): Promise<QuickResult> {
  return runQuickAction({ action: "homework.set_cover", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const parsed = coverSchema.safeParse(input);
    if (!parsed.success) return getQuickError(parsed.error.issues[0]?.message ?? "Check the picture details.");
    const filesProblem = await fetchCoverFilesProblem(parsed.data);
    if (filesProblem) return getQuickError(filesProblem);
    const { data: updated, error } = await supabase
      .from("homework_items")
      .update({ photo_path: parsed.data.folder, photo_alt: parsed.data.alt, photo_width: parsed.data.width, photo_height: parsed.data.height, is_photo_from_video: false })
      .eq("id", parsed.data.itemId)
      .eq("tenant_id", tenantId)
      .select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError(ITEM_NOT_FOUND_MESSAGE);
    refreshHomeworkPages();
    return getQuickSuccess("Cover picture saved.");
  });
}

/** Saves a cover made from the video's opening scene, unless an uploaded cover is already there. */
export async function setHomeworkVideoCoverAction(input: z.input<typeof videoCoverSchema>): Promise<QuickResult> {
  return runQuickAction({ action: "homework.make_cover", roles: EDITOR_ROLES }, async (admin) => {
    const parsed = videoCoverSchema.safeParse(input);
    if (!parsed.success) return getQuickError("Check the picture details.");
    const filesProblem = await fetchCoverFilesProblem(parsed.data);
    if (filesProblem) return getQuickError(filesProblem);
    const { data: updated, error } = await admin.supabase
      .from("homework_items")
      .update({ photo_path: parsed.data.folder, photo_alt: VIDEO_COVER_ALT, photo_width: parsed.data.width, photo_height: parsed.data.height, is_photo_from_video: true })
      .eq("id", parsed.data.itemId)
      .eq("tenant_id", admin.tenantId)
      .or(REPLACEABLE_COVER_FILTER)
      .select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (updated?.length) {
      refreshHomeworkPages();
      return getQuickSuccess(VIDEO_COVER_MADE_MESSAGE);
    }
    return getKeptCoverResult(admin, parsed.data.itemId);
  });
}

// Nothing was updated: either someone uploaded their own cover meanwhile, or the item is gone.
async function getKeptCoverResult(admin: AdminContext, itemId: string): Promise<QuickResult> {
  const { item, error } = await fetchStoredItem(admin, itemId);
  if (error) return getQuickError(getItemLoadErrorMessage(error));
  return item ? getQuickSuccess(UPLOADED_COVER_KEPT_MESSAGE) : getQuickError(ITEM_NOT_FOUND_MESSAGE);
}

export async function removeHomeworkCoverAction(itemId: string): Promise<QuickResult> {
  return runQuickAction({ action: "homework.remove_cover", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const { data: updated, error } = await supabase
      .from("homework_items")
      .update({ photo_path: null, photo_alt: null, photo_width: null, photo_height: null, is_photo_from_video: false })
      .eq("id", z.uuid().parse(itemId))
      .eq("tenant_id", tenantId)
      .select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError(ITEM_NOT_FOUND_MESSAGE);
    refreshHomeworkPages();
    return getQuickSuccess("Cover picture removed. Visitors see a dark box until a cover is added.");
  });
}
