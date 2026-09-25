"use server";

import { revalidatePath } from "next/cache";

import { getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { getFieldErrorsFromZod } from "@/lib/admin/auth-schemas";
import { siteSettingsSchema, type SiteSettingsInput } from "@/lib/admin/contact/site-settings-schema";
import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { EDITOR_ROLES } from "@/lib/admin/require-admin";
import { runAdminAction } from "@/lib/admin/run-admin-action";

function getSiteSettingsRow(input: SiteSettingsInput) {
  return {
    phone: input.phone,
    text_phone: input.textPhone,
    email: input.email,
    contact_names: input.contactNames,
    office_address_line1: input.officeAddressLine1,
    office_address_line2: input.officeAddressLine2,
    office_city: input.officeCity,
    office_state: input.officeState,
    office_postal_code: input.officePostalCode,
    license_number: input.licenseNumber,
    footer_text: input.footerText ?? "",
  };
}

export async function saveSiteSettingsAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction(EDITOR_ROLES, async ({ supabase, tenantId }) => {
    const values = getFormValues(formData);
    const parsed = siteSettingsSchema.safeParse(values);
    if (!parsed.success) return getErrorState({ message: "Fix the highlighted fields, then save again.", fieldErrors: getFieldErrorsFromZod(parsed.error), values });
    const { error } = await supabase.from("site_settings").upsert({ tenant_id: tenantId, ...getSiteSettingsRow(parsed.data) }, { onConflict: "tenant_id" });
    if (error) return getErrorState({ message: getDatabaseErrorMessage(error), values });
    revalidatePath("/admin/contact");
    return getSuccessState("Contact details saved. The website shows them now.");
  });
}
