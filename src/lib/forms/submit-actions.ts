"use server";

import { getFieldErrors, getFieldValues, getResultState, type RequestFormSchema, type RequestFormState } from "@/lib/forms/form-state";
import { submitNewRequest, type NewRequest } from "@/lib/forms/intake";
import { BOOKING_FORM_FIELDS, CONTACT_FORM_FIELDS, bookingFormSchema, contactFormSchema, type FormFieldConfig } from "@/lib/forms/request-forms";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { getErrorName, reportVisitorProblem } from "@/lib/observability/report-visitor-problem";
import { BOT_CHECK_KEY_FIELD, isOutdatedBotCheckKey } from "@/lib/security/bot-check-key";
import { isOverFormLimit } from "@/lib/security/rate-limit";
import { TURNSTILE_FIELD } from "@/lib/security/turnstile";
import { passesVisitorBotCheck } from "@/lib/security/visitor-bot-check";
import { fetchVisitor } from "@/lib/security/visitor";
import { getE164Phone } from "@/lib/site/phone";
import { fetchLeadTracking, getFormConversion, scheduleMetaLead, type LeadTracking } from "@/lib/tracking/lead-tracking";

// Server entry points for the public forms: every field is checked again with the same
// schemas the browser uses (Infra §2), then the rate limit, whether the page is out of date,
// the bot check, then the inbox. Every failure a visitor sees is recorded
// (docs/cwr-reliability-round-plan.md; docs/cwr-stale-quick-check-addendum.md).

type FormDefinition = {
  problemAction: Extract<ProblemAction, "site.contact_form" | "site.booking_form">;
  turnstileAction: string;
  schema: RequestFormSchema;
  fields: FormFieldConfig[];
  getRequest: (values: Record<string, string>) => Omit<NewRequest, "idempotencyKey">;
};

function getContactRequest(values: Record<string, string>): Omit<NewRequest, "idempotencyKey"> {
  return {
    source: "contact",
    contactName: (values.fullName ?? "").trim(),
    contactEmail: (values.email ?? "").trim().toLowerCase(),
    contactPhone: getE164Phone(values.phone ?? ""),
    subject: "Contact form",
    body: (values.message ?? "").trim(),
  };
}

function getBookingRequest(values: Record<string, string>): Omit<NewRequest, "idempotencyKey"> {
  const notes = (values.notes ?? "").trim();
  const body = [`Home address: ${(values.propertyAddress ?? "").trim()}`, `Days and times: ${(values.preferredTimes ?? "").trim()}`, notes ? `Notes: ${notes}` : null]
    .filter((line): line is string => line !== null)
    .join("\n\n");
  return {
    source: "booking",
    contactName: (values.fullName ?? "").trim(),
    contactEmail: (values.email ?? "").trim().toLowerCase() || null,
    contactPhone: getE164Phone(values.phone ?? ""),
    subject: "CWR TouchUp request",
    body,
  };
}

const CONTACT_FORM: FormDefinition = { problemAction: "site.contact_form", turnstileAction: "contact-form", schema: contactFormSchema, fields: CONTACT_FORM_FIELDS, getRequest: getContactRequest };
const BOOKING_FORM: FormDefinition = { problemAction: "site.booking_form", turnstileAction: "touchup-request-form", schema: bookingFormSchema, fields: BOOKING_FORM_FIELDS, getRequest: getBookingRequest };

// Only the error's name is recorded: database details can repeat the visitor's contact info.
async function saveRequest({ form, request, idempotencyKey, tracking }: { form: FormDefinition; request: Omit<NewRequest, "idempotencyKey">; idempotencyKey: string; tracking: LeadTracking }): Promise<boolean> {
  try {
    await submitNewRequest({ ...request, idempotencyKey, attribution: tracking.attributionRow });
    return true;
  } catch (error) {
    await reportVisitorProblem({ action: form.problemAction, stage: "database", severity: "error", code: getErrorName(error), detail: "The request could not be saved to the inbox." });
    return false;
  }
}

async function getOutdatedPageState(form: FormDefinition, values: Record<string, string>): Promise<RequestFormState> {
  await reportVisitorProblem({ action: form.problemAction, stage: "validate", severity: "warning", code: "outdated_page" });
  return getResultState({ status: "blocked", values, recovery: "refresh" });
}

async function submitRequestForm(form: FormDefinition, formData: FormData): Promise<RequestFormState> {
  const values = getFieldValues(formData, form.fields);
  const fieldErrors = getFieldErrors(form.schema, values);
  if (Object.keys(fieldErrors).length > 0) return getResultState({ status: "invalid", values, fieldErrors });
  const visitor = await fetchVisitor();
  if (await isOverFormLimit(visitor.ip, form.problemAction)) return getResultState({ status: "limited", values });
  if (isOutdatedBotCheckKey(formData.get(BOT_CHECK_KEY_FIELD))) return getOutdatedPageState(form, values);
  const token = String(formData.get(TURNSTILE_FIELD) ?? "");
  const isHuman = await passesVisitorBotCheck({ token, remoteIp: visitor.ip, expectedAction: form.turnstileAction, expectedHostname: visitor.hostname });
  if (!isHuman) return getResultState({ status: "blocked", values });
  const request = form.getRequest(values);
  const idempotencyKey = String(formData.get("idempotencyKey") ?? crypto.randomUUID());
  const tracking = await fetchLeadTracking(formData);
  if (!(await saveRequest({ form, request, idempotencyKey, tracking }))) return getResultState({ status: "failed", values });
  const contact = { email: request.contactEmail, phone: request.contactPhone };
  scheduleMetaLead({ source: request.source, eventId: idempotencyKey, contact, tracking, visitor });
  const conversion = await getFormConversion({ eventId: idempotencyKey, contact, tracking });
  return getResultState({ status: "sent", values: {}, sentTo: { name: request.contactName, email: request.contactEmail }, conversion });
}

// Boundary: anything unexpected becomes "didn't send" with the visitor's text kept, never a
// crash screen.
async function submitWithBoundary(form: FormDefinition, formData: FormData): Promise<RequestFormState> {
  try {
    return await submitRequestForm(form, formData);
  } catch (error) {
    await reportVisitorProblem({ action: form.problemAction, stage: "unexpected", severity: "error", code: getErrorName(error) });
    return getResultState({ status: "failed", values: getFieldValues(formData, form.fields) });
  }
}

export async function submitContactForm(_previousState: RequestFormState, formData: FormData): Promise<RequestFormState> {
  return submitWithBoundary(CONTACT_FORM, formData);
}

export async function submitBookingForm(_previousState: RequestFormState, formData: FormData): Promise<RequestFormState> {
  return submitWithBoundary(BOOKING_FORM, formData);
}
