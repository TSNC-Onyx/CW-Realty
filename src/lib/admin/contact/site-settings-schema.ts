import { z } from "zod";

import { getE164Phone } from "@/lib/site/phone";

// Contact & Footer rules (Admin §4): phone and email checked before saving; the office
// address is all-or-nothing so the footer never shows half an address.

const phoneMessage = "Enter a 10-digit US phone number, like (336) 555-0123";

const requiredPhone = z
  .string()
  .trim()
  .min(1, "Enter the main phone number")
  .transform((value, context) => getE164Phone(value) ?? (context.addIssue({ code: "custom", message: phoneMessage }), z.NEVER));

const optionalPhone = z
  .string()
  .trim()
  .transform((value, context) => (value === "" ? null : (getE164Phone(value) ?? (context.addIssue({ code: "custom", message: phoneMessage }), z.NEVER))));

const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength, `Keep this under ${maxLength} characters`)
    .transform((value) => (value === "" ? null : value));

export const siteSettingsSchema = z
  .object({
    phone: requiredPhone,
    textPhone: optionalPhone,
    email: z.string().trim().min(1, "Enter the main email address").pipe(z.email("Enter a full email address, like name@example.com")),
    contactNames: z
      .string()
      .max(500, "Keep this under 500 characters")
      .transform((value) => value.split(/[\n,]/).map((name) => name.trim()).filter(Boolean)),
    officeAddressLine1: optionalText(200),
    officeAddressLine2: optionalText(200),
    officeCity: optionalText(100),
    officeState: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || /^[A-Z]{2}$/.test(value), "Use the 2-letter state, like NC")
      .transform((value) => (value === "" ? null : value)),
    officePostalCode: z
      .string()
      .trim()
      .refine((value) => value === "" || /^[0-9]{5}$/.test(value), "Enter a 5-digit ZIP code")
      .transform((value) => (value === "" ? null : value)),
    licenseNumber: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || /^[A-Z0-9-]{1,20}$/.test(value), "Use letters, numbers, and dashes only")
      .transform((value) => (value === "" ? null : value)),
    footerText: optionalText(300),
  })
  .superRefine((values, context) => {
    const addressParts = [values.officeAddressLine1, values.officeCity, values.officeState, values.officePostalCode];
    const hasSomeAddress = addressParts.some((part) => part !== null);
    if (!hasSomeAddress) return;
    const missing: [keyof typeof values, string][] = [
      ["officeAddressLine1", "Enter the street address"],
      ["officeCity", "Enter the city"],
      ["officeState", "Enter the state"],
      ["officePostalCode", "Enter the ZIP code"],
    ];
    missing
      .filter(([field]) => values[field] === null)
      .forEach(([field, message]) => context.addIssue({ code: "custom", path: [field], message }));
  });

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
