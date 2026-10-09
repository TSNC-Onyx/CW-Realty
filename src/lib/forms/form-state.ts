import type { z } from "zod";

import type { FormFieldConfig } from "@/lib/forms/request-forms";
import type { FormConversion } from "@/lib/tracking/lead-tracking";

// Result of a public request-form submission, shared by the server action and the form UI.

export type FieldValues = Record<string, string>;
export type FieldErrors = Record<string, string>;

/**
 * idle: nothing sent yet · invalid: fields to fix · sent: in the inbox ·
 * blocked: the bot check did not pass · limited: too many sends from this connection ·
 * failed: could not be saved (visitor keeps their text).
 */
export type RequestFormStatus = "idle" | "invalid" | "sent" | "blocked" | "limited" | "failed";

// Which replies show a notice above the form. Every status must be listed, so a new one breaks
// the build until each form decides how to show it (docs/cwr-stale-quick-check-addendum.md 2b.4).
const HAS_NOTICE = { idle: false, invalid: false, sent: false, blocked: true, limited: true, failed: true } as const satisfies Record<RequestFormStatus, boolean>;

/** The replies that need a notice: each form's title map must cover exactly these. */
export type NoticeStatus = { [Status in RequestFormStatus]: (typeof HAS_NOTICE)[Status] extends true ? Status : never }[RequestFormStatus];

export function isNoticeStatus(status: RequestFormStatus): status is NoticeStatus {
  return HAS_NOTICE[status];
}

/** refresh: the page is out of date; reloading it (with the typed text kept) fixes it. */
export type FormRecovery = "refresh";

export type RequestFormState = {
  status: RequestFormStatus;
  values: FieldValues;
  fieldErrors: FieldErrors;
  responseId: string;
  sentTo: { name: string; email: string | null } | null;
  /** Set when a request is sent: the key event's ID and, with Advertising allowed, hashed contact details. */
  conversion: FormConversion | null;
  recovery: FormRecovery | null;
};

export type RequestFormSchema = z.ZodObject<Record<string, z.ZodType<unknown, string>>>;

export const INITIAL_FORM_STATE: RequestFormState = {
  status: "idle",
  values: {},
  fieldErrors: {},
  responseId: "initial",
  sentTo: null,
  conversion: null,
  recovery: null,
};

export function getFieldValues(formData: FormData, fields: FormFieldConfig[]): FieldValues {
  return Object.fromEntries(
    fields.map(({ name }) => {
      const value = formData.get(name);
      return [name, typeof value === "string" ? value : ""];
    }),
  );
}

/** First problem for one field, or null when the value is fine. */
export function getFieldError(schema: RequestFormSchema, name: string, value: string): string | null {
  const fieldSchema = schema.shape[name];
  if (!fieldSchema) return null;
  const result = fieldSchema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

export function getFieldErrors(schema: RequestFormSchema, values: FieldValues): FieldErrors {
  const entries = Object.keys(schema.shape).map((name) => [name, getFieldError(schema, name, values[name] ?? "")]);
  return Object.fromEntries(entries.filter((entry): entry is [string, string] => entry[1] !== null));
}

type ResultStateOptions = {
  status: RequestFormStatus;
  values: FieldValues;
  fieldErrors?: FieldErrors;
  sentTo?: RequestFormState["sentTo"];
  conversion?: FormConversion | null;
  recovery?: FormRecovery | null;
};

export function getResultState({ status, values, fieldErrors = {}, sentTo = null, conversion = null, recovery = null }: ResultStateOptions): RequestFormState {
  return { status, values, fieldErrors, sentTo, conversion, recovery, responseId: crypto.randomUUID() };
}
