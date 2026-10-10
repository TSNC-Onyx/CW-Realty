"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCreatedState, getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { getFieldErrorsFromZod } from "@/lib/admin/auth-schemas";
import { getDatabaseErrorMessage, isUniqueViolation } from "@/lib/admin/database-errors";
import { runOnce } from "@/lib/admin/idempotency";
import { getListingRow, listingSchema } from "@/lib/admin/listings/listing-schema";
import { MAX_ALT_TEXT_LENGTH } from "@/lib/admin/photos/photo-files";
import { fetchPhotoFilesCheck, getPhotoFilesMessage } from "@/lib/admin/photos/photo-storage";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { EDITOR_ROLES, type AdminContext } from "@/lib/admin/require-admin";
import { runAdminAction } from "@/lib/admin/run-admin-action";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { LISTING_STATUSES } from "@/lib/content/listing-statuses";
import type { ProblemAction } from "@/lib/observability/problem-catalog";

const LISTINGS_ADMIN_PATH = "/admin/listings";
const SLUG_TAKEN = "Another listing already uses this web address";
const NOT_FOUND_MESSAGE = "That listing or photo no longer exists. It may have been moved to the trash.";
// New listings start at the end; cwr.move_item renumbers on the first move.
const NEW_ITEM_SORT_ORDER = 9999;
const FIRST_PHOTO_SORT_ORDER = 1;
// A drag can't move a photo further than this many places (far more than any listing has).
const MAX_PHOTO_MOVE_STEPS = 200;

const TRANSITION_MESSAGES: Record<string, string> = {
  live: "Published. The listing is on the website now.",
  draft: "Taken off the website. It is saved as a draft.",
  coming_soon: "Marked as coming soon.",
  for_sale: "Marked as for sale.",
  under_contract: "Marked as under contract.",
  sold: "Marked as sold. It stays on the website with a Sold label.",
};

const transitionSchema = z.object({
  listingId: z.uuid(),
  workflow: z.enum(["listing_status", "listing_publish"]),
  toState: z.enum([...LISTING_STATUSES, "live", "draft"]),
});

const photoSchema = z.object({
  listingId: z.uuid(),
  folder: z.string().regex(/^listings\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().trim().min(1, "Describe the photo").max(MAX_ALT_TEXT_LENGTH),
});

const photoMoveSchema = z.object({
  photoId: z.uuid(),
  steps: z.number().int().min(-MAX_PHOTO_MOVE_STEPS).max(MAX_PHOTO_MOVE_STEPS).refine((steps) => steps !== 0),
});

type CreateResult = { id: string } | { error: { code?: string; message: string } };

type DatabaseClient = AdminContext["supabase"];

type NextSortOrder = { sortOrder: number } | { error: { code?: string; message: string } };

function refreshListingPages(): void {
  revalidatePath(LISTINGS_ADMIN_PATH, "layout");
}

function getSaveError(error: { code?: string; message: string }, values: Record<string, string>): ActionState {
  if (isUniqueViolation(error)) return getErrorState({ message: SLUG_TAKEN, fieldErrors: { slug: SLUG_TAKEN }, values });
  return getErrorState({ message: getDatabaseErrorMessage(error), values });
}

type MoveOptions = { action: ProblemAction; table: "listings" | "listing_photos"; id: string; direction: "up" | "down" };

async function moveItem({ action, table, id, direction }: MoveOptions): Promise<QuickResult> {
  return runQuickAction({ action, roles: EDITOR_ROLES }, async ({ supabase }) => {
    const { error } = await supabase.rpc("move_item", { p_table: table, p_id: z.uuid().parse(id), p_direction: direction });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshListingPages();
    return getQuickSuccess(direction === "up" ? "Moved up." : "Moved down.");
  });
}

// Photos added together keep the order they were picked in: each goes after the last one.
async function fetchNextPhotoSortOrder(supabase: DatabaseClient, listingId: string): Promise<NextSortOrder> {
  const { data, error } = await supabase.from("listing_photos").select("sort_order").eq("listing_id", listingId).is("deleted_at", null).order("sort_order", { ascending: false }).limit(1);
  if (error) return { error: { code: error.code, message: error.message } };
  const lastSortOrder = (data[0]?.sort_order as number | undefined) ?? null;
  return { sortOrder: lastSortOrder === null ? FIRST_PHOTO_SORT_ORDER : lastSortOrder + 1 };
}

export async function createListingAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction({ action: "listings.create", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const values = getFormValues(formData);
    const parsed = listingSchema.safeParse(values);
    if (!parsed.success) return getErrorState({ message: "Fix the highlighted fields.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
    const created = await runOnce<CreateResult>({
      tenantId,
      scope: "listings.create",
      key: values.idempotencyKey ?? "",
      requestBody: JSON.stringify(parsed.data),
      run: async () => {
        const { data, error } = await supabase.from("listings").insert({ tenant_id: tenantId, ...getListingRow(parsed.data), sort_order: NEW_ITEM_SORT_ORDER }).select("id").single();
        return error ? { error: { code: error.code, message: error.message } } : { id: data.id as string };
      },
    });
    if ("error" in created) return getSaveError(created.error, values);
    refreshListingPages();
    // The page uploads the chosen photos to the new listing, then opens it.
    return getCreatedState("Saved.", created.id);
  });
}

export async function updateListingAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction({ action: "listings.update", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const values = getFormValues(formData);
    const listingId = z.uuid().safeParse(values.listingId);
    const parsed = listingSchema.safeParse(values);
    if (!listingId.success) return getErrorState({ message: "That listing couldn't be found." });
    if (!parsed.success) return getErrorState({ message: "Fix the highlighted fields.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
    const { data: updated, error } = await supabase.from("listings").update(getListingRow(parsed.data)).eq("id", listingId.data).eq("tenant_id", tenantId).select("id");
    if (error) return getSaveError(error, values);
    if (!updated?.length) return getErrorState({ message: NOT_FOUND_MESSAGE, values });
    refreshListingPages();
    return getSuccessState("Saved.");
  });
}

export async function transitionListingAction(input: z.input<typeof transitionSchema>): Promise<QuickResult> {
  return runQuickAction({ action: "listings.change_state", roles: EDITOR_ROLES }, async ({ supabase }) => {
    const { listingId, workflow, toState } = transitionSchema.parse(input);
    const { error } = await supabase.rpc("transition", { p_workflow_key: workflow, p_record_id: listingId, p_to_state: toState });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshListingPages();
    return getQuickSuccess(TRANSITION_MESSAGES[toState] ?? "Updated.");
  });
}

export async function moveListingAction(listingId: string, direction: "up" | "down"): Promise<QuickResult> {
  return moveItem({ action: "listings.move", table: "listings", id: listingId, direction });
}

export async function moveListingPhotoAction(photoId: string, direction: "up" | "down"): Promise<QuickResult> {
  return moveItem({ action: "listings.move_photo", table: "listing_photos", id: photoId, direction });
}

/** Drag and drop: moves a photo several places in one call (steps < 0 = earlier), one cwr.move_item step at a time. */
export async function moveListingPhotoToAction(input: z.input<typeof photoMoveSchema>): Promise<QuickResult> {
  return runQuickAction({ action: "listings.move_photo", roles: EDITOR_ROLES }, async ({ supabase }) => {
    const parsed = photoMoveSchema.safeParse(input);
    if (!parsed.success) return getQuickError("That photo couldn't be moved. Refresh the page and try again.");
    const { photoId, steps } = parsed.data;
    const direction = steps < 0 ? "up" : "down";
    for (let step = 0; step < Math.abs(steps); step += 1) {
      const { error } = await supabase.rpc("move_item", { p_table: "listing_photos", p_id: photoId, p_direction: direction });
      // Steps already taken are saved, so the page shows where the photo ended up.
      if (error) {
        refreshListingPages();
        return getQuickError(getDatabaseErrorMessage(error));
      }
    }
    refreshListingPages();
    return getQuickSuccess("Photo moved.");
  });
}

export async function addListingPhotoAction(input: z.input<typeof photoSchema>): Promise<QuickResult> {
  return runQuickAction({ action: "listings.add_photo", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const parsed = photoSchema.safeParse(input);
    if (!parsed.success) return getQuickError(parsed.error.issues[0]?.message ?? "Check the photo details.");
    const { listingId, folder, width, height, alt } = parsed.data;
    if (!folder.startsWith(`listings/${listingId}/`)) return getQuickError("That photo belongs to another listing.");
    const filesCheck = await fetchPhotoFilesCheck(folder);
    if (filesCheck !== "complete") return getQuickError(getPhotoFilesMessage(filesCheck));
    const next = await fetchNextPhotoSortOrder(supabase, listingId);
    if ("error" in next) return getQuickError(getDatabaseErrorMessage(next.error));
    const row = { tenant_id: tenantId, listing_id: listingId, storage_path: folder, alt_text: alt, width, height, sort_order: next.sortOrder };
    const { error } = await supabase.from("listing_photos").insert(row);
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshListingPages();
    return getQuickSuccess("Photo added.");
  });
}

export async function updatePhotoAltAction(photoId: string, alt: string): Promise<QuickResult> {
  return runQuickAction({ action: "listings.update_photo_alt", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const parsedAlt = z.string().trim().min(1, "Describe the photo").max(MAX_ALT_TEXT_LENGTH).safeParse(alt);
    if (!parsedAlt.success) return getQuickError(parsedAlt.error.issues[0]?.message ?? "Describe the photo");
    const { data: updated, error } = await supabase.from("listing_photos").update({ alt_text: parsedAlt.data }).eq("id", z.uuid().parse(photoId)).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError(NOT_FOUND_MESSAGE);
    refreshListingPages();
    return getQuickSuccess("Photo description saved.");
  });
}
