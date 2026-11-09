import { z } from "zod";

// People's first and last names (623Summit repo, docs/owner-names-plan.md, owner approved
// 2026-11-05). A name lives on the Supabase Auth login shared with 623 Summit, as
// user_metadata.first_name and last_name, so one name shows on both sites. It is a display
// label and never grants access: anyone signed in can change their own user_metadata.
//
// The rule matches 623's supabase/functions/_shared/owner-names.ts: trimmed, 1–100 characters
// counted as code points, and no control characters. name-schema.test.ts runs the same cases.

export const MAX_NAME_LENGTH = 100;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/u;

const FIRST_NAME_ERROR = "Enter a first name of up to 100 characters.";
const LAST_NAME_ERROR = "Enter a last name of up to 100 characters.";

export type PersonName = { firstName: string; lastName: string };

/** The name keys as Supabase Auth stores them on the login. */
export type NameMetadata = { first_name?: unknown; last_name?: unknown };

export type InviteNames = { isValid: true; names: PersonName } | { isValid: false; fieldErrors: Record<string, string> };

export const personNameSchema = z
  .string()
  .trim()
  .refine((name) => isWithinLength(name) && !CONTROL_CHARACTERS.test(name));

/** The invite form's two names, or the message beside each one that breaks the rule. */
export function parseInviteNames(values: Record<string, string | undefined>): InviteNames {
  const first = personNameSchema.safeParse(values.firstName ?? "");
  const last = personNameSchema.safeParse(values.lastName ?? "");
  if (first.success && last.success) return { isValid: true, names: { firstName: first.data, lastName: last.data } };
  return {
    isValid: false,
    fieldErrors: { ...(!first.success && { firstName: FIRST_NAME_ERROR }), ...(!last.success && { lastName: LAST_NAME_ERROR }) },
  };
}

/** The non-empty parts of a stored name, joined by one space; "" when there is none. */
export function getDisplayName(metadata: NameMetadata | null | undefined): string {
  return [getStoredPart(metadata?.first_name), getStoredPart(metadata?.last_name)].filter(Boolean).join(" ");
}

/** A stored name part, trimmed; null when it is missing, blank or not text. */
export function getStoredPart(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** What the owner reads after an invite: today's sentence, plus a word on the name when it needs one. */
export function getInviteMessage({ email, isNew, keptName, isNameSaved }: { email: string; isNew: boolean; keptName: string | null; isNameSaved: boolean }): string {
  const invited = isNew ? `Invite sent to ${email}.` : `${email} already had an account and now has access.`;
  if (keptName) return `${invited} Their name stays as ${keptName}.`;
  if (!isNameSaved) return `${invited} Their name couldn't be saved; use Add name in the list.`;
  return invited;
}

function isWithinLength(name: string): boolean {
  const length = [...name].length;
  return length > 0 && length <= MAX_NAME_LENGTH;
}
