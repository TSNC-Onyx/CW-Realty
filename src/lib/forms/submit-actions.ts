"use server";

import { getFieldErrors, getFieldValues, getResultState, type RequestFormSchema, type RequestFormState } from "@/lib/forms/form-state";
import { submitNewRequest, type NewRequest } from "@/lib/forms/intake";
import { BOOKING_FORM_FIELDS, CONTACT_FORM_FIELDS, bookingFormSchema, contactFormSchema, type FormFieldConfig } from "@/lib/forms/request-forms";
import { isOverFormLimit } from "@/lib/security/rate-limit";
import { TURNSTILE_FIELD, verifyTurnstileToken } from "@/lib/security/turnstile";
import { fetchVisitor } from "@/lib/security/visitor";
import { getE164Phone } from "@/lib/site/phone";
import { fetchLeadTracking, getFormConversion, scheduleMetaLead, type LeadTracking } from "@/lib/tracking/lead-tracking";

// Server entry points for the public forms: every field is checked again with the same
// schemas the browser uses (Infra §2), then the bot check, then the inbox.

type FormDefinition = {
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

const CONTACT_FORM: FormDefinition = { turnstileAction: "contact-form", schema: contactFormSchema, fields: CONTACT_FORM_FIELDS, getRequest: getContactRequest };
const BOOKING_FORM: FormDefinition = { turnstileAction: "touchup-request-form", schema: bookingFormSchema, fields: BOOKING_FORM_FIELDS, getRequest: getBookingRequest };

// Only the error's name is logged: database details can repeat the visitor's contact info.
async function saveRequest({ request, idempotencyKey, tracking }: { request: Omit<NewRequest, "idempotencyKey">; idempotencyKey: string; tracking: LeadTracking }): Promise<boolean> {
  try {
    await submitNewRequest({ ...request, idempotencyKey, attribution: tracking.attributionRow });
    return true;
  } catch (error) {
    console.error(JSON.stringify({ message: "Request intake failed", source: request.source, error: error instanceof Error ? error.name : "unknown" }));
    return false;
  }
}

async function submitRequestForm(form: FormDefinition, formData: FormData): Promise<RequestFormState> {
  const values = getFieldValues(formData, form.fields);
  const fieldErrors = getFieldErrors(form.schema, values);
  if (Object.keys(fieldErrors).length > 0) return getResultState({ status: "invalid", values, fieldErrors });
  const visitor = await fetchVisitor();
  if (await isOverFormLimit(visitor.ip)) return getResultState({ status: "limited", values });
  const token = String(formData.get(TURNSTILE_FIELD) ?? "");
  const isHuman = await verifyTurnstileToken({ token, remoteIp: visitor.ip, expectedAction: form.turnstileAction, expectedHostname: visitor.hostname });
  if (!isHuman) return getResultState({ status: "blocked", values });
  const request = form.getRequest(values);
  const idempotencyKey = String(formData.get("idempotencyKey") ?? crypto.randomUUID());
  const tracking = await fetchLeadTracking(formData);
  if (!(await saveRequest({ request, idempotencyKey, tracking }))) return getResultState({ status: "failed", values });
  const contact = { email: request.contactEmail, phone: request.contactPhone };
  scheduleMetaLead({ source: request.source, eventId: idempotencyKey, contact, tracking, visitor });
  const conversion = await getFormConversion({ eventId: idempotencyKey, contact, tracking });
  return getResultState({ status: "sent", values: {}, sentTo: { name: request.contactName, email: request.contactEmail }, conversion });
}

export async function submitContactForm(_previousState: RequestFormState, formData: FormData): Promise<RequestFormState> {
  return submitRequestForm(CONTACT_FORM, formData);
}

export async function submitBookingForm(_previousState: RequestFormState, formData: FormData): Promise<RequestFormState> {
  return submitRequestForm(BOOKING_FORM, formData);
}
