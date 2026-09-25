import { cache } from "react";
import { z } from "zod";

import { CWR_TENANT_SLUG, SupabaseQueryError, getPublicClient } from "@/lib/supabase/public-client";
import type { E164Phone } from "@/lib/site/phone";

const SITE_SETTINGS_COLUMNS =
  "phone, text_phone, email, contact_names, footer_text, license_number, office_address_line1, office_address_line2, office_city, office_state, office_postal_code, tenants!inner(slug)";

const e164PhoneSchema = z
  .string()
  .regex(/^\+1[2-9][0-9]{9}$/)
  .transform((phone) => phone as E164Phone);

const siteSettingsRowSchema = z.object({
  phone: e164PhoneSchema,
  text_phone: e164PhoneSchema.nullable(),
  email: z.string(),
  contact_names: z.array(z.string()),
  footer_text: z.string(),
  license_number: z.string().nullable(),
  office_address_line1: z.string().nullable(),
  office_address_line2: z.string().nullable(),
  office_city: z.string().nullable(),
  office_state: z.string().nullable(),
  office_postal_code: z.string().nullable(),
});

type SiteSettingsRow = z.infer<typeof siteSettingsRowSchema>;

export type OfficeAddress = { streetLines: string[]; cityLine: string };

export type SiteSettings = {
  callPhone: E164Phone;
  textPhone: E164Phone;
  email: string;
  contactNames: string[];
  footerText: string;
  licenseNumber: string | null;
  officeAddress: OfficeAddress | null;
};

function getOfficeAddress(row: SiteSettingsRow): OfficeAddress | null {
  const { office_address_line1, office_address_line2, office_city, office_state, office_postal_code } = row;
  if (!office_address_line1 || !office_city || !office_state || !office_postal_code) return null;
  const streetLines = [office_address_line1, office_address_line2].filter((line): line is string => Boolean(line));
  return { streetLines, cityLine: `${office_city}, ${office_state} ${office_postal_code}` };
}

function getSiteSettingsFromRow(row: SiteSettingsRow): SiteSettings {
  return {
    callPhone: row.phone,
    textPhone: row.text_phone ?? row.phone,
    email: row.email,
    contactNames: row.contact_names,
    footerText: row.footer_text,
    licenseNumber: row.license_number,
    officeAddress: getOfficeAddress(row),
  };
}

async function fetchSiteSettingsRow(): Promise<SiteSettingsRow | null> {
  const client = getPublicClient();
  if (!client) return null;
  const { data: row, error } = await client
    .from("site_settings")
    .select(SITE_SETTINGS_COLUMNS)
    .eq("tenants.slug", CWR_TENANT_SLUG)
    .maybeSingle();
  if (error) throw new SupabaseQueryError(error.message, { operation: "fetchSiteSettings", cause: error });
  if (!row) return null;
  return siteSettingsRowSchema.parse(row);
}

/**
 * Phone, email, and office address edited once in the admin portal (Admin §4).
 * Returns null when the database is unreachable so pages still render (Infra §3).
 */
export const fetchSiteSettings = cache(async (): Promise<SiteSettings | null> => {
  try {
    const row = await fetchSiteSettingsRow();
    return row ? getSiteSettingsFromRow(row) : null;
  } catch (error) {
    console.error("Site settings unavailable; rendering without contact details", error);
    return null;
  }
});
