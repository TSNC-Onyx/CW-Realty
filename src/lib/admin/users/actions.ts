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
import { noteProblemCause, type ProblemCause } from "@/lib/observability/action-context";
import { reportProblem } from "@/lib/observability/report-problem";
import { createServiceClient } from "@/lib/supabase/service-client";

// Users & roles (parent plan: owners only). Invites go by email; the invited person sets
// a password and turns on sign-in codes before they can open the portal.

const USERS_PATH = "/admin/users";
const MAX_USERS = 1000;
const EMAIL_EXISTS = "email_exists";
const RESET_ACTION = "users.reset_sign_in_codes";
const SIGN_IN_SERVICE_MESSAGE = "We couldn't reach the sign-in service. Try again in a moment.";

const roleSchema = z.enum(["owner", "manager", "staff"]);
const inviteSchema = z.object({ email: emailSchema, role: roleSchema });

type InviteResult = { message: string } | { error: string };

type AuthAdminError = { name: string; code?: string; message: string };

type AuthAdmin = ReturnType<typeof createServiceClient>["auth"]["admin"];

type FactorRemoval = { removedCount: number; totalCount: number; error: AuthAdminError | null };

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

// One at a time, so a failure part-way says exactly how many codes were already removed.
async function removeFactors({ auth, userId, factorIds }: { auth: AuthAdmin; userId: string; factorIds: string[] }): Promise<FactorRemoval> {
  for (const [index, id] of factorIds.entries()) {
    const { error } = await auth.mfa.deleteFactor({ userId, id });
    if (error) return { removedCount: index, totalCount: factorIds.length, error };
  }
  return { removedCount: factorIds.length, totalCount: factorIds.length, error: null };
}

// Some codes gone and some not is a half-finished change only another reset can fix.
function getRemovalFailure({ removedCount, totalCount, error }: FactorRemoval & { error: AuthAdminError }): { cause: ProblemCause; message: string } {
  const code = error.code ?? error.name;
  if (removedCount === 0) return { cause: { stage: "external", severity: "error", code, detail: error.message }, message: "The reset didn't finish. Nothing was changed. Try again." };
  return {
    cause: { stage: "external", severity: "critical", code, detail: `Removed ${removedCount} of ${totalCount} authenticator factors, then: ${error.message}` },
    message: `The reset only partly finished: ${removedCount} of ${totalCount} sign-in codes were removed, then removing the next one failed. Run the reset again to finish it.`,
  };
}

async function recordResetAudit({ supabase, targetId }: { supabase: AdminContext["supabase"]; targetId: string }): Promise<void> {
  const { error } = await supabase.rpc("record_sign_in_codes_reset", { p_user_id: targetId });
  if (!error) return;
  await reportProblem({ action: RESET_ACTION, stage: "database", severity: "warning", code: error.code ?? "database", detail: `Reset done but not added to the activity log: ${error.message}` });
}

// Returns what to tell the owner when the reset can't start, or null when the person is a member.
async function fetchMembershipProblem({ supabase, tenantId, targetId }: { supabase: AdminContext["supabase"]; tenantId: string; targetId: string }): Promise<string | null> {
  const { data: membership, error } = await supabase.from("memberships").select("user_id").eq("tenant_id", tenantId).eq("user_id", targetId).maybeSingle();
  if (error) {
    noteProblemCause({ stage: "load", severity: "error", code: error.code ?? "database", detail: error.message });
    return "We couldn't check this person's access. Try again in a moment.";
  }
  return membership ? null : "That person doesn't have access here.";
}

async function fetchFactorIds({ auth, targetId }: { auth: AuthAdmin; targetId: string }): Promise<{ factorIds: string[] } | { error: string }> {
  const { data, error } = await auth.getUserById(targetId);
  if (error) {
    noteAuthAdminCause(error);
    return { error: SIGN_IN_SERVICE_MESSAGE };
  }
  if (!data.user) return { error: "That person's account couldn't be found." };
  return { factorIds: (data.user.factors ?? []).map((factor) => factor.id) };
}

export async function resetSignInCodesAction(userId: string): Promise<QuickResult> {
  return runQuickAction({ action: RESET_ACTION, roles: OWNER_ROLES }, async ({ supabase, tenantId }) => {
    const targetId = z.uuid().parse(userId);
    const membershipProblem = await fetchMembershipProblem({ supabase, tenantId, targetId });
    if (membershipProblem) return getQuickError(membershipProblem);
    const auth = createServiceClient().auth.admin;
    const factors = await fetchFactorIds({ auth, targetId });
    if ("error" in factors) return getQuickError(factors.error);
    const removal = await removeFactors({ auth, userId: targetId, factorIds: factors.factorIds });
    if (removal.error) {
      const failure = getRemovalFailure({ ...removal, error: removal.error });
      noteProblemCause(failure.cause);
      return getQuickError(failure.message);
    }
    await recordResetAudit({ supabase, targetId });
    revalidatePath(USERS_PATH);
    return getQuickSuccess("Sign-in codes reset. They'll set up their authenticator app again at their next sign-in.");
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
