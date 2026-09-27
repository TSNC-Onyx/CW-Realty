import { z } from "zod";

import { CONNECTION_CATEGORIES } from "@/lib/content/connection-categories";
import { getE164Phone } from "@/lib/site/phone";

// Connection (referral partner) rules for Admin → Connections; they mirror the database
// checks in migration 20260926000200_cwr_connections.sql.

const MAX_NAME_LENGTH = 200;
const MAX_TITLE_LENGTH = 200;
const MAX_WEBSITE_LENGTH = 500;
const WEB_ADDRESS = /^https?:\/\/\S+$/i;
const phoneMessage = "Enter a 10-digit US phone number, like (336) 555-0123";

function getOptionalText(value: string): string | null {
  return value === "" ? null : value;
}

export const connectionSchema = z.object({
  fullName: z.string().trim().min(1, "Enter the person's name").max(MAX_NAME_LENGTH, "Keep the name under 200 characters"),
  category: z.enum(CONNECTION_CATEGORIES, "Choose a category"),
  titleLine: z.string().trim().max(MAX_TITLE_LENGTH, "Keep the title under 200 characters"),
  phone: z
    .string()
    .trim()
    .transform((value, context) => (value === "" ? null : (getE164Phone(value) ?? (context.addIssue({ code: "custom", message: phoneMessage }), z.NEVER)))),
  email: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a full email address, like name@example.com")
    .transform((value) => getOptionalText(value.toLowerCase())),
  website: z
    .string()
    .trim()
    .max(MAX_WEBSITE_LENGTH, "Keep the web address under 500 characters")
    .refine((value) => value === "" || WEB_ADDRESS.test(value), "Enter a full web address starting with https://")
    .transform(getOptionalText),
  isVisible: z.string().optional().transform((value) => value === "on"),
});

export type ConnectionInput = z.infer<typeof connectionSchema>;

export function getConnectionRow(input: ConnectionInput) {
  return {
    full_name: input.fullName,
    category: input.category,
    title_line: input.titleLine,
    phone: input.phone,
    email: input.email,
    website: input.website,
    is_visible: input.isVisible,
  };
}
