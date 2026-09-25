import type { Metadata } from "next";

import { ContactSettingsForm, type ContactSettingsDefaults } from "@/components/admin/contact/contact-settings-form";
import { TextLink } from "@/components/ui/text-link";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { getDisplayPhone, type E164Phone } from "@/lib/site/phone";

export const metadata: Metadata = { title: "Contact & footer" };

type SiteSettingsRow = {
  phone: E164Phone;
  text_phone: E164Phone | null;
  email: string;
  contact_names: string[];
  office_address_line1: string | null;
  office_address_line2: string | null;
  office_city: string | null;
  office_state: string | null;
  office_postal_code: string | null;
  license_number: string | null;
  footer_text: string;
};

function getDefaults(row: SiteSettingsRow | null): ContactSettingsDefaults {
  return {
    phone: row ? getDisplayPhone(row.phone) : "",
    textPhone: row?.text_phone ? getDisplayPhone(row.text_phone) : "",
    email: row?.email ?? "",
    contactNames: row?.contact_names.join("\n") ?? "",
    officeAddressLine1: row?.office_address_line1 ?? "",
    officeAddressLine2: row?.office_address_line2 ?? "",
    officeCity: row?.office_city ?? "",
    officeState: row?.office_state ?? "",
    officePostalCode: row?.office_postal_code ?? "",
    licenseNumber: row?.license_number ?? "",
    footerText: row?.footer_text ?? "",
  };
}

export default async function ContactSettingsPage() {
  const { supabase, tenantId } = await requireAdminPage(EDITOR_ROLES);
  const { data: row } = await supabase.from("site_settings").select("*").eq("tenant_id", tenantId).maybeSingle<SiteSettingsRow>();
  return (
    <>
      <h1 className="type-h1 mb-2">Contact &amp; footer</h1>
      <p className="type-lead mb-2 text-muted">Edit these once — every page uses them.</p>
      <div className="mb-10">
        <TextLink href="/contact" hasArrow>View the Contact page</TextLink>
      </div>
      <ContactSettingsForm defaults={getDefaults(row)} />
    </>
  );
}
