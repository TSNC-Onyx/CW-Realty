import type { z } from "zod";

import type { FormFieldConfig } from "@/lib/forms/request-forms";

// Result of a request-form submission, shared by the server action and the form UI.
// "unavailable" means the details passed every check but online intake is not
// switched on yet (it arrives with the inbox in Phase 4); nothing is stored.

export type FieldValues = Record<string, string>;
export type FieldErrors = Record<string, string>;

export type RequestFormStatus = "idle" | "invalid" | "unavailable";

export type RequestFormState = {
  status: RequestFormStatus;
  values: FieldValues;
  fieldErrors: FieldErrors;
  responseId: string;
};

export type RequestFormSchema = z.ZodObject<Record<string, z.ZodType<unknown, string>>>;

export const INITIAL_FORM_STATE: RequestFormState = {
  status: "idle",
  values: {},
  fieldErrors: {},
  responseId: "initial",
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

type RequestFormInput = { schema: RequestFormSchema; fields: FormFieldConfig[]; formData: FormData };

export function getRequestFormState({ schema, fields, formData }: RequestFormInput): RequestFormState {
  const values = getFieldValues(formData, fields);
  const fieldErrors = getFieldErrors(schema, values);
  const status: RequestFormStatus = Object.keys(fieldErrors).length > 0 ? "invalid" : "unavailable";
  return { status, values, fieldErrors, responseId: crypto.randomUUID() };
}
