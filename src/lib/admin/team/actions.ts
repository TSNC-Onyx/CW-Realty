"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { getFieldErrorsFromZod } from "@/lib/admin/auth-schemas";
import { getDatabaseErrorMessage, isUniqueViolation } from "@/lib/admin/database-errors";
import { runOnce } from "@/lib/admin/idempotency";
import { hasAllPhotoFiles } from "@/lib/admin/photos/photo-storage";
import { MAX_ALT_TEXT_LENGTH } from "@/lib/admin/photos/photo-files";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { EDITOR_ROLES } from "@/lib/admin/require-admin";
import { runAdminAction } from "@/lib/admin/run-admin-action";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { getTeamMemberRow, teamMemberSchema } from "@/lib/admin/team/team-schema";

const TEAM_ADMIN_PATH = "/admin/team";
const SLUG_TAKEN = "Another team member already uses this web address";
const NOT_FOUND_MESSAGE = "That team member no longer exists. It may have been moved to the trash.";
// New people start at the end of the grid; cwr.move_item renumbers on the first move.
const NEW_ITEM_SORT_ORDER = 9999;

const photoSchema = z.object({
  memberId: z.uuid(),
  folder: z.string().regex(/^team\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().trim().min(1, "Describe the photo").max(MAX_ALT_TEXT_LENGTH),
});

function getSaveError(error: { code?: string; message: string }, values: Record<string, string>): ActionState {
  if (isUniqueViolation(error)) return getErrorState({ message: SLUG_TAKEN, fieldErrors: { slug: SLUG_TAKEN }, values });
  return getErrorState({ message: getDatabaseErrorMessage(error), values });
}

type CreateResult = { id: string } | { error: { code?: string; message: string } };

export async function createTeamMemberAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const values = getFormValues(formData);
    const parsed = teamMemberSchema.safeParse(values);
    if (!parsed.success) return getErrorState({ message: "Fix the highlighted fields.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
    const created = await runOnce<CreateResult>({
      tenantId,
      scope: "team_members.create",
      key: values.idempotencyKey ?? "",
      requestBody: JSON.stringify(parsed.data),
      run: async () => {
        const { data, error } = await supabase.from("team_members").insert({ tenant_id: tenantId, ...getTeamMemberRow(parsed.data), sort_order: NEW_ITEM_SORT_ORDER }).select("id").single();
        return error ? { error: { code: error.code, message: error.message } } : { id: data.id as string };
      },
    });
    if ("error" in created) return getSaveError(created.error, values);
    redirect(`${TEAM_ADMIN_PATH}/${created.id}?created=1`);
  });
}

export async function updateTeamMemberAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const values = getFormValues(formData);
    const memberId = z.uuid().safeParse(values.memberId);
    const parsed = teamMemberSchema.safeParse(values);
    if (!memberId.success) return getErrorState({ message: "That team member couldn't be found." });
    if (!parsed.success) return getErrorState({ message: "Fix the highlighted fields.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
    const { data: updated, error } = await supabase.from("team_members").update(getTeamMemberRow(parsed.data)).eq("id", memberId.data).eq("tenant_id", tenantId).select("id");
    if (error) return getSaveError(error, values);
    if (!updated?.length) return getErrorState({ message: NOT_FOUND_MESSAGE, values });
    revalidatePath(TEAM_ADMIN_PATH, "layout");
    return getSuccessState("Saved. The team page shows the changes now.");
  });
}

export async function setTeamPhotoAction(input: z.input<typeof photoSchema>): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const parsed = photoSchema.safeParse(input);
    if (!parsed.success) return getQuickError(parsed.error.issues[0]?.message ?? "Check the photo details.");
    if (!parsed.data.folder.startsWith(`team/${parsed.data.memberId}/`)) return getQuickError("That photo belongs to someone else.");
    if (!(await hasAllPhotoFiles(parsed.data.folder))) return getQuickError("The photo didn't finish uploading. Try again.");
    const { data: updated, error } = await supabase
      .from("team_members")
      .update({ photo_path: parsed.data.folder, photo_alt: parsed.data.alt, photo_width: parsed.data.width, photo_height: parsed.data.height })
      .eq("id", parsed.data.memberId)
      .eq("tenant_id", tenantId)
      .select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError(NOT_FOUND_MESSAGE);
    revalidatePath(TEAM_ADMIN_PATH, "layout");
    return getQuickSuccess("Photo saved.");
  });
}

export async function removeTeamPhotoAction(memberId: string): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const id = z.uuid().parse(memberId);
    const { data: updated, error } = await supabase
      .from("team_members")
      .update({ photo_path: null, photo_alt: null, photo_width: null, photo_height: null })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError(NOT_FOUND_MESSAGE);
    revalidatePath(TEAM_ADMIN_PATH, "layout");
    // The files stay for a day so Undo works; the nightly cleanup removes them after that.
    return getQuickSuccess("Photo removed. The profile shows a placeholder until you add another.");
  });
}

export async function moveTeamMemberAction(memberId: string, direction: "up" | "down"): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase }) => {
    const { error } = await supabase.rpc("move_item", { p_table: "team_members", p_id: z.uuid().parse(memberId), p_direction: direction });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    revalidatePath(TEAM_ADMIN_PATH);
    return getQuickSuccess(direction === "up" ? "Moved up." : "Moved down.");
  });
}

export async function setTeamMemberVisibilityAction(memberId: string, isVisible: boolean): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const { data: updated, error } = await supabase.from("team_members").update({ is_visible: isVisible }).eq("id", z.uuid().parse(memberId)).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError(NOT_FOUND_MESSAGE);
    revalidatePath(TEAM_ADMIN_PATH);
    return getQuickSuccess(isVisible ? "Shown on the team page." : "Hidden. Their page is kept and sends visitors to the team page.");
  });
}
