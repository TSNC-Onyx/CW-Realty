"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { emailSchema } from "@/lib/admin/auth-schemas";
import { getDatabaseErrorMessage, isUniqueViolation } from "@/lib/admin/database-errors";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { EDITOR_ROLES } from "@/lib/admin/require-admin";
import { runAdminAction } from "@/lib/admin/run-admin-action";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { isEmailConfigured } from "@/lib/email/send-email";
import { enqueueAlertJob } from "@/lib/jobs/enqueue-alert-job";

// Alert recipients (Admin §5 "choose who receives alerts", "send a test alert").

const NOTIFICATIONS_PATH = "/admin/notifications";
const SOURCES = ["contact", "booking", "chat_handoff"] as const;

const recipientSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a name").max(200, "Keep the name under 200 characters"),
  email: emailSchema,
  alertSources: z.array(z.enum(SOURCES)).min(1, "Choose at least one kind of alert"),
});

export type RecipientInput = z.input<typeof recipientSchema>;

function getRecipientRow(input: z.infer<typeof recipientSchema>) {
  return { full_name: input.fullName, email: input.email.toLowerCase(), alert_sources: input.alertSources, is_active: true };
}

export async function addRecipientAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const values = getFormValues(formData);
    const parsed = recipientSchema.safeParse({ fullName: values.fullName, email: values.email, alertSources: formData.getAll("alertSources") });
    if (!parsed.success) {
      const fieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
      return getErrorState({ message: "Fix the highlighted fields.", fieldErrors, values });
    }
    const { error } = await supabase.from("notification_recipients").insert({ tenant_id: tenantId, ...getRecipientRow(parsed.data) });
    if (error && isUniqueViolation(error)) return getErrorState({ message: "That email already gets alerts.", fieldErrors: { email: "That email already gets alerts" }, values });
    if (error) return getErrorState({ message: getDatabaseErrorMessage(error), values });
    revalidatePath(NOTIFICATIONS_PATH);
    return getSuccessState(`${parsed.data.fullName} will get alerts.`);
  });
}

export async function restoreRecipientAction(input: RecipientInput): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const parsed = recipientSchema.parse(input);
    const { error } = await supabase.from("notification_recipients").insert({ tenant_id: tenantId, ...getRecipientRow(parsed) });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    revalidatePath(NOTIFICATIONS_PATH);
    return getQuickSuccess("Restored.");
  });
}

export async function removeRecipientAction(recipientId: string): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const { data, error } = await supabase.from("notification_recipients").delete().eq("id", z.uuid().parse(recipientId)).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!data?.length) return getQuickError("That person was already removed.");
    revalidatePath(NOTIFICATIONS_PATH);
    return getQuickSuccess("They no longer get alerts.");
  });
}

export async function setRecipientActiveAction(recipientId: string, isActive: boolean): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const { data, error } = await supabase.from("notification_recipients").update({ is_active: isActive }).eq("id", z.uuid().parse(recipientId)).eq("tenant_id", tenantId).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!data?.length) return getQuickError("That person was removed.");
    revalidatePath(NOTIFICATIONS_PATH);
    return getQuickSuccess(isActive ? "Alerts turned back on." : "Alerts paused for this person.");
  });
}

export async function sendTestAlertAction(): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ tenantId }) => {
    await enqueueAlertJob({ kind: "test", tenantId, runId: crypto.randomUUID() });
    revalidatePath(NOTIFICATIONS_PATH);
    if (!isEmailConfigured()) return getQuickSuccess("Test logged below. Email sending isn't set up yet, so nothing was sent.");
    return getQuickSuccess("Test alert sent. Check each inbox (and spam folder) in the next few minutes.");
  });
}

export async function retryDeliveryAction(deliveryId: string): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const id = z.uuid().parse(deliveryId);
    const { data: delivery } = await supabase.from("alert_deliveries").select("status").eq("id", id).eq("tenant_id", tenantId).maybeSingle<{ status: string }>();
    if (!delivery) return getQuickError("That email isn't in the log any more.");
    if (delivery.status !== "failed") return getQuickError("Only failed emails can be retried.");
    await enqueueAlertJob({ kind: "retry", deliveryId: id });
    revalidatePath(NOTIFICATIONS_PATH);
    return getQuickSuccess("Trying again. The log updates in a moment.");
  });
}
