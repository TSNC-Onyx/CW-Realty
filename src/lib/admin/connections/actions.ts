"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCreatedState, getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { getFieldErrorsFromZod } from "@/lib/admin/auth-schemas";
import { connectionSchema, getConnectionRow } from "@/lib/admin/connections/connection-schema";
import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { runOnce } from "@/lib/admin/idempotency";
import { fetchPhotoFilesCheck, getPhotoFilesMessage } from "@/lib/admin/photos/photo-storage";
import { MAX_ALT_TEXT_LENGTH } from "@/lib/admin/photos/photo-files";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { EDITOR_ROLES, OWNER_ROLES } from "@/lib/admin/require-admin";
import { runAdminAction } from "@/lib/admin/run-admin-action";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { CONNECTIONS_PAGE_PATH } from "@/lib/site/navigation";

// Admin → Connections, built like Team (owner approval 2026-09-26).

const CONNECTIONS_ADMIN_PATH = "/admin/connections";
const NOT_FOUND_MESSAGE = "That connection no longer exists. It may have been moved to the trash.";
// New partners start at the end of the list; cwr.move_item renumbers on the first move.
const NEW_ITEM_SORT_ORDER = 9999;

const photoSchema = z.object({
  connectionId: z.uuid(),
  folder: z.string().regex(/^connections\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().trim().min(1, "Describe the photo").max(MAX_ALT_TEXT_LENGTH),
});

type CreateResult = { id: string } | { error: { code?: string; message: string } };

function refreshConnectionPages(): void {
  revalidatePath(CONNECTIONS_ADMIN_PATH, "layout");
  revalidatePath(CONNECTIONS_PAGE_PATH);
}

export async function createConnectionAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction({ action: "connections.create", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const values = getFormValues(formData);
    const parsed = connectionSchema.safeParse(values);
    if (!parsed.success) return getErrorState({ message: "Fix the highlighted fields.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
    const created = await runOnce<CreateResult>({
      tenantId,
      scope: "connections.create",
      key: values.idempotencyKey ?? "",
      requestBody: JSON.stringify(parsed.data),
      run: async () => {
        const { data, error } = await supabase.from("connections").insert({ tenant_id: tenantId, ...getConnectionRow(parsed.data), sort_order: NEW_ITEM_SORT_ORDER }).select("id").single();
        return error ? { error: { code: error.code, message: error.message } } : { id: data.id as string };
      },
    });
    if ("error" in created) return getErrorState({ message: getDatabaseErrorMessage(created.error), values });
    refreshConnectionPages();
    // The page uploads the chosen photo to the new partner, then opens it.
    return getCreatedState("Saved.", created.id);
  });
}

export async function updateConnectionAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction({ action: "connections.update", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const values = getFormValues(formData);
    const connectionId = z.uuid().safeParse(values.connectionId);
    const parsed = connectionSchema.safeParse(values);
    if (!connectionId.success) return getErrorState({ message: "That connection couldn't be found." });
    if (!parsed.success) return getErrorState({ message: "Fix the highlighted fields.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
    const { data: updated, error } = await supabase.from("connections").update(getConnectionRow(parsed.data)).eq("id", connectionId.data).eq("tenant_id", tenantId).select("id");
    if (error) return getErrorState({ message: getDatabaseErrorMessage(error), values });
    if (!updated?.length) return getErrorState({ message: NOT_FOUND_MESSAGE, values });
    refreshConnectionPages();
    return getSuccessState("Saved. The Connections page shows the changes now.");
  });
}

export async function setConnectionPhotoAction(input: z.input<typeof photoSchema>): Promise<QuickResult> {
  return runQuickAction({ action: "connections.set_photo", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const parsed = photoSchema.safeParse(input);
    if (!parsed.success) return getQuickError(parsed.error.issues[0]?.message ?? "Check the photo details.");
    if (!parsed.data.folder.startsWith(`connections/${parsed.data.connectionId}/`)) return getQuickError("That photo belongs to someone else.");
    const filesCheck = await fetchPhotoFilesCheck(parsed.data.folder);
    if (filesCheck !== "complete") return getQuickError(getPhotoFilesMessage(filesCheck));
    const { data: updated, error } = await supabase
      .from("connections")
      .update({ photo_path: parsed.data.folder, photo_alt: parsed.data.alt, photo_width: parsed.data.width, photo_height: parsed.data.height })
      .eq("id", parsed.data.connectionId)
      .eq("tenant_id", tenantId)
      .select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError(NOT_FOUND_MESSAGE);
    refreshConnectionPages();
    return getQuickSuccess("Photo saved.");
  });
}

export async function removeConnectionPhotoAction(connectionId: string): Promise<QuickResult> {
  return runQuickAction({ action: "connections.remove_photo", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const id = z.uuid().parse(connectionId);
    const { data: updated, error } = await supabase
      .from("connections")
      .update({ photo_path: null, photo_alt: null, photo_width: null, photo_height: null })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError(NOT_FOUND_MESSAGE);
    refreshConnectionPages();
    // The files stay for a day so Undo works; the nightly cleanup removes them after that.
    return getQuickSuccess("Photo removed. The Connections page shows a placeholder until you add another.");
  });
}

export async function moveConnectionAction(connectionId: string, direction: "up" | "down"): Promise<QuickResult> {
  return runQuickAction({ action: "connections.move", roles: EDITOR_ROLES }, async ({ supabase }) => {
    const { error } = await supabase.rpc("move_item", { p_table: "connections", p_id: z.uuid().parse(connectionId), p_direction: direction });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshConnectionPages();
    return getQuickSuccess(direction === "up" ? "Moved up." : "Moved down.");
  });
}

export async function setConnectionVisibilityAction(connectionId: string, isVisible: boolean): Promise<QuickResult> {
  return runQuickAction({ action: "connections.set_visibility", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const { data: updated, error } = await supabase.from("connections").update({ is_visible: isVisible }).eq("id", z.uuid().parse(connectionId)).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError(NOT_FOUND_MESSAGE);
    refreshConnectionPages();
    return getQuickSuccess(isVisible ? "Shown on the Connections page." : "Hidden from the Connections page.");
  });
}

/** Owners only: hides or shows the whole public Connections page (docs/cwr-connections-page-switch-plan.md). */
export async function setConnectionsPageVisibilityAction(isVisible: boolean): Promise<QuickResult> {
  return runQuickAction({ action: "connections.set_page_visibility", roles: OWNER_ROLES }, async ({ supabase, tenantId }) => {
    const { data: updated, error } = await supabase.from("site_settings").update({ is_connections_page_visible: z.boolean().parse(isVisible) }).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError("The website settings weren't found. Add the contact details first, then try again.");
    // Every public page's menu and footer change, so the whole site refreshes.
    revalidatePath("/", "layout");
    revalidatePath(CONNECTIONS_ADMIN_PATH, "layout");
    return getQuickSuccess(isVisible ? "The Connections page is showing on the website again." : "The Connections page is hidden. Visitors are sent to Resources.");
  });
}
