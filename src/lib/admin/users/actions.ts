"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { emailSchema } from "@/lib/admin/auth-schemas";
import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { runOnce } from "@/lib/admin/idempotency";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { OWNER_ROLES, type AdminContext } from "@/lib/admin/require-admin";
import { runAdminAction } from "@/lib/admin/run-admin-action";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { noteProblemCause } from "@/lib/observability/action-context";
import { createServiceClient } from "@/lib/supabase/service-client";

// Users & roles (parent plan: owners only). Invites go by email; the invited person sets
// a password, then opens the portal (no authenticator code since 2026-10-09).

const USERS_PATH = "/admin/users";
const MAX_USERS = 1000;
const EMAIL_EXISTS = "email_exists";

const roleSchema = z.enum(["owner", "manager", "staff"]);
const inviteSchema = z.object({ email: emailSchema, role: roleSchema });

type InviteResult = { message: string } | { error: string };

type AuthAdminError = { name: string; code?: string; message: string };

// The sign-in service (Supabase Auth) failed: a system fault, not something the owner typed.
function noteAuthAdminCause(error: AuthAdminError): void {
  noteProblemCause({ stage: "external", severity: "error", code: error.code ?? error.name, detail: error.message });
}

async function fetchExistingUserId(email: string): Promise<string | null> {
  const { data, error } = await createServiceClient().auth.admin.listUsers({ page: 1, perPage: MAX_USERS });
  if (error) {
    noteAuthAdminCause(error);
    return null;
  }
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

// Only "this email already has an account" falls back to that account; any other problem
// (email delivery, rate limits) is reported instead of quietly granting access.
async function getInvitedUserId(email: string): Promise<{ userId: string; isNew: boolean } | null> {
  const { data, error } = await createServiceClient().auth.admin.inviteUserByEmail(email);
  if (!error) return data.user ? { userId: data.user.id, isNew: true } : null;
  if (error.code !== EMAIL_EXISTS) {
    noteAuthAdminCause(error);
    return null;
  }
  const existingId = await fetchExistingUserId(email);
  return existingId ? { userId: existingId, isNew: false } : null;
}

async function addMembership({ supabase, tenantId }: AdminContext, { email, role }: z.infer<typeof inviteSchema>): Promise<InviteResult> {
  const invited = await getInvitedUserId(email);
  if (!invited) return { error: "The invite couldn't be sent. Check the email address, wait a minute, and try again." };
  const { error } = await supabase.from("memberships").insert({ tenant_id: tenantId, user_id: invited.userId, role });
  if (error?.code === "23505") return { error: "That person already has access. Change their role in the list instead." };
  if (error) return { error: getDatabaseErrorMessage(error) };
  return { message: invited.isNew ? `Invite sent to ${email}.` : `${email} already had an account and now has access.` };
}

export async function inviteUserAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction({ action: "users.invite", roles: OWNER_ROLES }, async (admin) => {
    const values = getFormValues(formData);
    const parsed = inviteSchema.safeParse(values);
    if (!parsed.success) return getErrorState({ message: "Check the email address.", fieldErrors: { email: parsed.error.issues[0]?.message ?? "" }, values });
    const result = await runOnce<InviteResult>({
      tenantId: admin.tenantId,
      scope: "memberships.invite",
      key: values.idempotencyKey ?? "",
      requestBody: JSON.stringify(parsed.data),
      run: () => addMembership(admin, parsed.data),
    });
    if ("error" in result) return getErrorState({ message: result.error, fieldErrors: { email: result.error }, values });
    revalidatePath(USERS_PATH);
    return getSuccessState(result.message);
  });
}

export async function changeRoleAction(userId: string, role: string): Promise<QuickResult> {
  return runQuickAction({ action: "users.change_role", roles: OWNER_ROLES }, async ({ supabase, tenantId }) => {
    const { data: updated, error } = await supabase.from("memberships").update({ role: roleSchema.parse(role) }).eq("tenant_id", tenantId).eq("user_id", z.uuid().parse(userId)).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!updated?.length) return getQuickError("That person no longer has access here.");
    revalidatePath(USERS_PATH);
    return getQuickSuccess("Role changed. It applies right away.");
  });
}

export async function removeAccessAction(userId: string): Promise<QuickResult> {
  return runQuickAction({ action: "users.remove_access", roles: OWNER_ROLES }, async ({ supabase, tenantId, userId: currentUserId }) => {
    const targetId = z.uuid().parse(userId);
    if (targetId === currentUserId) return getQuickError("You can't remove your own access. Ask another owner.");
    const { data: removed, error } = await supabase.from("memberships").delete().eq("tenant_id", tenantId).eq("user_id", targetId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!removed?.length) return getQuickError("They no longer had access. Refresh the page to see who does.");
    revalidatePath(USERS_PATH);
    return getQuickSuccess("Access removed. They can no longer open the admin portal.");
  });
}

// Undo for "Remove access": gives the same person the same role back.
export async function restoreAccessAction(userId: string, role: string): Promise<QuickResult> {
  return runQuickAction({ action: "users.restore_access", roles: OWNER_ROLES }, async ({ supabase, tenantId }) => {
    const { error } = await supabase.from("memberships").insert({ tenant_id: tenantId, user_id: z.uuid().parse(userId), role: roleSchema.parse(role) });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    revalidatePath(USERS_PATH);
    return getQuickSuccess("Access restored.");
  });
}
