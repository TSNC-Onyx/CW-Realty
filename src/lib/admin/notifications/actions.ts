"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { emailSchema } from "@/lib/admin/auth-schemas";
import { getDatabaseErrorMessage, isUniqueViolation } from "@/lib/admin/database-errors";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { EDITOR_ROLES, OWNER_ROLES, type AdminContext } from "@/lib/admin/require-admin";
import { runAdminAction } from "@/lib/admin/run-admin-action";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { enqueueAlertJob, type EnqueueOutcome } from "@/lib/jobs/enqueue-alert-job";
import { noteProblemCause } from "@/lib/observability/action-context";

// Alert recipients (Admin §5 "choose who receives alerts", "send a test alert"). Only owners
// choose who gets problem emails; the database enforces the same rule.

const NOTIFICATIONS_PATH = "/admin/notifications";
const RECIPIENTS_TABLE = "notification_recipients";
const SOURCES = ["contact", "booking", "chat_handoff"] as const;
const ENQUEUE_FAILED_CODE = "alert_job_failed";
const TEST_NOT_SENT_MESSAGE = "The test alert didn't go out. Check the log below.";
const RETRY_NOT_SENT_MESSAGE = "The email still didn't go out. Check the log below.";

const recipientSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a name").max(200, "Keep the name under 200 characters"),
  email: emailSchema,
  alertSources: z.array(z.enum(SOURCES)).min(1, "Choose at least one kind of alert"),
});

const restoredRecipientSchema = recipientSchema.extend({ getsProblemAlerts: z.boolean() });

export type RecipientInput = z.input<typeof restoredRecipientSchema>;

function getRecipientRow(input: z.infer<typeof recipientSchema>) {
  return { full_name: input.fullName, email: input.email.toLowerCase(), alert_sources: input.alertSources, is_active: true };
}

function refreshNotifications(): void {
  revalidatePath(NOTIFICATIONS_PATH);
}

/** The email job was recorded where it failed; its reference is shown, not recorded twice. */
function getEnqueueFailure(outcome: EnqueueOutcome, message: string): QuickResult {
  const cause = { stage: "job", severity: "error", code: ENQUEUE_FAILED_CODE, detail: null } as const;
  if (!outcome.reference) {
    noteProblemCause(cause);
    return getQuickError(message);
  }
  noteProblemCause({ ...cause, reference: outcome.reference });
  return getQuickError(`${message} (Ref ${outcome.reference})`);
}

/** Why this email can't be retried, or null when it can. A load error is not "not in the log". */
async function fetchRetryBlockedMessage({ supabase, tenantId }: Pick<AdminContext, "supabase" | "tenantId">, deliveryId: string): Promise<string | null> {
  const { data: delivery, error } = await supabase.from("alert_deliveries").select("status, kind").eq("id", deliveryId).eq("tenant_id", tenantId).maybeSingle<{ status: string; kind: string }>();
  if (error) {
    noteProblemCause({ stage: "load", severity: "error", code: error.code ?? "load", detail: error.message });
    return "We couldn't load this email. Try again in a moment.";
  }
  if (!delivery) return "That email isn't in the log any more.";
  if (delivery.kind === "problem") return "Problem emails are re-sent automatically.";
  if (delivery.status !== "failed") return "Only failed emails can be retried.";
  return null;
}

export async function addRecipientAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction({ action: "notifications.add_recipient", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const values = getFormValues(formData);
    const parsed = recipientSchema.safeParse({ fullName: values.fullName, email: values.email, alertSources: formData.getAll("alertSources") });
    if (!parsed.success) {
      const fieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
      return getErrorState({ message: "Fix the highlighted fields.", fieldErrors, values });
    }
    const { error } = await supabase.from(RECIPIENTS_TABLE).insert({ tenant_id: tenantId, ...getRecipientRow(parsed.data) });
    if (error && isUniqueViolation(error)) return getErrorState({ message: "That email already gets alerts.", fieldErrors: { email: "That email already gets alerts" }, values });
    if (error) return getErrorState({ message: getDatabaseErrorMessage(error), values });
    refreshNotifications();
    return getSuccessState(`${parsed.data.fullName} will get alerts.`);
  });
}

/** Undo of Remove: puts the person back exactly as they were, problem alerts included. */
export async function restoreRecipientAction(input: RecipientInput): Promise<QuickResult> {
  return runQuickAction({ action: "notifications.restore_recipient", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const parsed = restoredRecipientSchema.parse(input);
    const { error } = await supabase.from(RECIPIENTS_TABLE).insert({ tenant_id: tenantId, ...getRecipientRow(parsed), gets_problem_alerts: parsed.getsProblemAlerts });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshNotifications();
    return getQuickSuccess("Restored.");
  });
}

export async function removeRecipientAction(recipientId: string): Promise<QuickResult> {
  return runQuickAction({ action: "notifications.remove_recipient", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const { data, error } = await supabase.from(RECIPIENTS_TABLE).delete().eq("id", z.uuid().parse(recipientId)).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!data.length) return getQuickError("That person was already removed.");
    refreshNotifications();
    return getQuickSuccess("They no longer get alerts.");
  });
}

export async function setRecipientActiveAction(recipientId: string, isActive: boolean): Promise<QuickResult> {
  return runQuickAction({ action: "notifications.set_recipient_active", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const { data, error } = await supabase.from(RECIPIENTS_TABLE).update({ is_active: z.boolean().parse(isActive) }).eq("id", z.uuid().parse(recipientId)).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!data.length) return getQuickError("That person was removed.");
    refreshNotifications();
    return getQuickSuccess(isActive ? "Alerts turned back on." : "Alerts paused for this person.");
  });
}

export async function setRecipientProblemAlertsAction(recipientId: string, isOn: boolean): Promise<QuickResult> {
  return runQuickAction({ action: "notifications.set_recipient_problem_alerts", roles: OWNER_ROLES }, async ({ supabase, tenantId }) => {
    const isTurningOn = z.boolean().parse(isOn);
    const { data, error } = await supabase.from(RECIPIENTS_TABLE).update({ gets_problem_alerts: isTurningOn }).eq("id", z.uuid().parse(recipientId)).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!data.length) return getQuickError("That person was removed.");
    refreshNotifications();
    return getQuickSuccess(isTurningOn ? "They'll get problem emails." : "They no longer get problem emails.");
  });
}

export async function sendTestAlertAction(): Promise<QuickResult> {
  return runQuickAction({ action: "notifications.send_test_alert", roles: EDITOR_ROLES }, async ({ tenantId }) => {
    const outcome = await enqueueAlertJob({ kind: "test", tenantId, runId: crypto.randomUUID() });
    refreshNotifications();
    if (outcome.status === "failed") return getEnqueueFailure(outcome, TEST_NOT_SENT_MESSAGE);
    if (outcome.status === "not_set_up") return getQuickSuccess("Test logged below. Email sending isn't set up yet, so nothing was sent.");
    return getQuickSuccess("Test alert sent. Check each inbox (and spam folder) in the next few minutes.");
  });
}

export async function retryDeliveryAction(deliveryId: string): Promise<QuickResult> {
  return runQuickAction({ action: "notifications.retry_delivery", roles: EDITOR_ROLES }, async ({ supabase, tenantId }) => {
    const id = z.uuid().parse(deliveryId);
    const blockedMessage = await fetchRetryBlockedMessage({ supabase, tenantId }, id);
    if (blockedMessage) return getQuickError(blockedMessage);
    const outcome = await enqueueAlertJob({ kind: "retry", deliveryId: id });
    refreshNotifications();
    if (outcome.status === "failed") return getEnqueueFailure(outcome, RETRY_NOT_SENT_MESSAGE);
    if (outcome.status === "not_set_up") return getEnqueueFailure(outcome, "Email sending isn't set up yet, so nothing was sent.");
    return getQuickSuccess("Trying again. The log updates in a moment.");
  });
}
