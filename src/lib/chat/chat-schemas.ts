import { z } from "zod";

import { fullNameSchema, optionalEmailSchema, optionalPhoneSchema } from "@/lib/forms/field-schemas";
import type { FormFieldConfig } from "@/lib/forms/request-forms";

// Chat limits and the "Talk to a person" form, shared by the widget and the server (Infra §2).

// Cloudflare Turnstile action names: a token made for one form is refused by the other.
export const CHAT_TURNSTILE_ACTION = "chat";
export const HANDOFF_TURNSTILE_ACTION = "chat-handoff";

export const MAX_CHAT_MESSAGE_LENGTH = 1000;
export const MAX_VISITOR_MESSAGES_PER_CHAT = 20;
const MAX_QUESTION_LENGTH = 2000;
export const CONTACT_NEEDED_MESSAGE = "Enter an email or a phone number so we can reply";

export const chatMessageSchema = z.object({
  sessionId: z.uuid().nullable(),
  message: z.string().trim().min(1, "Type a question first").max(MAX_CHAT_MESSAGE_LENGTH, `Keep your question under ${MAX_CHAT_MESSAGE_LENGTH} characters`),
  turnstileToken: z.string().max(2048),
});

export type ChatMessageInput = z.input<typeof chatMessageSchema>;

export const handoffFormSchema = z.object({
  fullName: fullNameSchema,
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  question: z.string().trim().min(1, "Tell us what you'd like help with").max(MAX_QUESTION_LENGTH, `Keep this under ${MAX_QUESTION_LENGTH} characters`),
});

export const HANDOFF_FORM_FIELDS: FormFieldConfig[] = [
  { name: "fullName", label: "Full name", kind: "text", autoComplete: "name" },
  { name: "email", label: "Email", kind: "email", autoComplete: "email", isOptional: true },
  { name: "phone", label: "Phone", kind: "tel", autoComplete: "tel-national", isOptional: true, helperText: "Give an email, a phone number, or both." },
  { name: "question", label: "What can we help with?", kind: "textarea" },
];

/** The form needs at least one way to reply; the per-field rules cannot express that. */
export function hasReplyContact(values: Record<string, string>): boolean {
  return (values.email ?? "").trim() !== "" || (values.phone ?? "").trim() !== "";
}
