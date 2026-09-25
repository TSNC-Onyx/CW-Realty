"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { getFieldErrorsFromZod } from "@/lib/admin/auth-schemas";
import { getDatabaseErrorMessage, isUniqueViolation } from "@/lib/admin/database-errors";
import { runOnce } from "@/lib/admin/idempotency";
import { getListingRow, listingSchema } from "@/lib/admin/listings/listing-schema";
import { MAX_ALT_TEXT_LENGTH } from "@/lib/admin/photos/photo-files";
import { hasAllPhotoFiles } from "@/lib/admin/photos/photo-storage";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { EDITOR_ROLES } from "@/lib/admin/require-admin";
import { runAdminAction } from "@/lib/admin/run-admin-action";
import { runQuickAction } from "@/lib/admin/run-quick-action";

const LISTINGS_ADMIN_PATH = "/admin/listings";
const SLUG_TAKEN = "Another listing already uses this web address";
const NOT_FOUND_MESSAGE = "That listing or photo no longer exists. It may have been moved to the trash.";
// New listings start at the end; cwr.move_item renumbers on the first move.
const NEW_ITEM_SORT_ORDER = 9999;

const TRANSITION_MESSAGES: Record<string, string> = {
  live: "Published. The listing is on the website now.",
  draft: "Taken off the website. It is saved as a draft.",
  active: "Marked as active.",
  pending: "Marked as pending.",
  sold: "Marked as sold. It stays on the website with a Sold label.",
};

const transitionSchema = z.object({
  listingId: z.uuid(),
  workflow: z.enum(["listing_status", "listing_publish"]),
  toState: z.enum(["active", "pending", "sold", "live", "draft"]),
});

const photoSchema = z.object({
  listingId: z.uuid(),
  folder: z.string().regex(/^listings\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().trim().min(1, "Describe the photo").max(MAX_ALT_TEXT_LENGTH),
});

type CreateResult = { id: string } | { error: { code?: string; message: string } };

function refreshListingPages(): void {
  revalidatePath(LISTINGS_ADMIN_PATH, "layout");
}

function getSaveError(error: { code?: string; message: string }, values: Record<string, string>): ActionState {
  if (isUniqueViolation(error)) return getErrorState({ message: SLUG_TAKEN, fieldErrors: { slug: SLUG_TAKEN }, values });
  return getErrorState({ message: getDatabaseErrorMessage(error), values });
}

async function moveItem(table: "listings" | "listing_photos", id: string, direction: "up" | "down"): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase }) => {
    const { error } = await supabase.rpc("move_item", { p_table: table, p_id: z.uuid().parse(id), p_direction: direction });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshListingPages();
    return getQuickSuccess(direction === "up" ? "Moved up." : "Moved down.");
  });
}

export async function createListingAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
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
    redirect(`${LISTINGS_ADMIN_PATH}/${created.id}?created=1`);
  });
}

export async function updateListingAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
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
  return runQuickAction(EDITOR_ROLES, async ({ supabase }) => {
    const { listingId, workflow, toState } = transitionSchema.parse(input);
    const { error } = await supabase.rpc("transition", { p_workflow_key: workflow, p_record_id: listingId, p_to_state: toState });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshListingPages();
    return getQuickSuccess(TRANSITION_MESSAGES[toState] ?? "Updated.");
  });
}

export async function moveListingAction(listingId: string, direction: "up" | "down"): Promise<QuickResult> {
  return moveItem("listings", listingId, direction);
}

export async function moveListingPhotoAction(photoId: string, direction: "up" | "down"): Promise<QuickResult> {
  return moveItem("listing_photos", photoId, direction);
}

export async function addListingPhotoAction(input: z.input<typeof photoSchema>): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const parsed = photoSchema.safeParse(input);
    if (!parsed.success) return getQuickError(parsed.error.issues[0]?.message ?? "Check the photo details.");
    const { listingId, folder, width, height, alt } = parsed.data;
    if (!folder.startsWith(`listings/${listingId}/`)) return getQuickError("That photo belongs to another listing.");
    if (!(await hasAllPhotoFiles(folder))) return getQuickError("The photo didn't finish uploading. Try again.");
    const row = { tenant_id: tenantId, listing_id: listingId, storage_path: folder, alt_text: alt, width, height, sort_order: NEW_ITEM_SORT_ORDER };
    const { error } = await supabase.from("listing_photos").insert(row);
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshListingPages();
    return getQuickSuccess("Photo added.");
  });
}

export async function updatePhotoAltAction(photoId: string, alt: string): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const parsedAlt = z.string().trim().min(1, "Describe the photo").max(MAX_ALT_TEXT_LENGTH).safeParse(alt);
    if (!parsedAlt.success) return getQuickError(parsedAlt.error.issues[0]?.message ?? "Describe the photo");
    const { data: updated, error } = await supabase.from("listing_photos").update({ alt_text: parsedAlt.data }).eq("id", z.uuid().parse(photoId)).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError(NOT_FOUND_MESSAGE);
    refreshListingPages();
    return getQuickSuccess("Photo description saved.");
  });
}
