import { z } from "zod";

import { getSlug, isValidSlug } from "@/lib/admin/slug";
import { getE164Phone } from "@/lib/site/phone";

// Team profile rules (Admin §3: photo, title, bio, contact).

const phoneMessage = "Enter a 10-digit US phone number, like (336) 555-0123";

export const teamMemberSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter the person's name").max(200, "Keep the name under 200 characters"),
    jobTitle: z.string().trim().max(200, "Keep the title under 200 characters"),
    email: z
      .string()
      .trim()
      .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a full email address, like name@example.com")
      .transform((value) => (value === "" ? null : value.toLowerCase())),
    phone: z
      .string()
      .trim()
      .transform((value, context) => (value === "" ? null : (getE164Phone(value) ?? (context.addIssue({ code: "custom", message: phoneMessage }), z.NEVER)))),
    bio: z.string().trim().max(20000, "Keep the bio under 20,000 characters"),
    slug: z.string().trim().toLowerCase(),
    isVisible: z.string().optional().transform((value) => value === "on"),
  })
  .transform((values) => ({ ...values, slug: values.slug === "" ? getSlug(values.fullName) : values.slug }))
  .refine((values) => isValidSlug(values.slug), { message: "Use lowercase letters, numbers, and dashes, like jane-smith", path: ["slug"] });

export type TeamMemberInput = z.infer<typeof teamMemberSchema>;

export function getTeamMemberRow(input: TeamMemberInput) {
  return {
    full_name: input.fullName,
    job_title: input.jobTitle,
    email: input.email,
    phone: input.phone,
    bio: input.bio,
    slug: input.slug,
    is_visible: input.isVisible,
  };
}
