"use server";

import { revalidatePath } from "next/cache";

import { getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { getFieldErrorsFromZod } from "@/lib/admin/auth-schemas";
import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { OWNER_ROLES } from "@/lib/admin/require-admin";
import { runAdminAction } from "@/lib/admin/run-admin-action";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { trackingSettingsSchema } from "@/lib/admin/tracking/tracking-schema";

// Owner-only: a Tag Manager container can run any script on the website (plan decision 6).

const TRACKING_PATH = "/admin/tracking";

export async function saveTrackingSettingsAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction(OWNER_ROLES, async ({ supabase, tenantId }) => {
    const values = getFormValues(formData);
    const parsed = trackingSettingsSchema.safeParse(values);
    if (!parsed.success) return getErrorState({ message: "Fix the highlighted fields, then save again.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
    const row = { tenant_id: tenantId, gtm_container_id: parsed.data.gtmContainerId, meta_pixel_id: parsed.data.metaPixelId };
    const { error } = await supabase.from("tracking_settings").upsert(row, { onConflict: "tenant_id" });
    if (error) return getErrorState({ message: getDatabaseErrorMessage(error), values });
    revalidatePath(TRACKING_PATH);
    return getSuccessState(parsed.data.gtmContainerId ? "Saved. Visitors now see the cookie choices." : "Saved. Tracking is off, and visitors see no cookie banner.");
  });
}

export async function markTagsReviewedAction(): Promise<QuickResult> {
  return runQuickAction(OWNER_ROLES, async ({ supabase, tenantId }) => {
    const { error } = await supabase.from("tracking_settings").upsert({ tenant_id: tenantId, tags_reviewed_at: new Date().toISOString() }, { onConflict: "tenant_id" });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    revalidatePath(TRACKING_PATH);
    return getQuickSuccess("Marked as reviewed today. We'll remind you in 90 days.");
  });
}
