"use server";

import { getRequestFormState, type RequestFormState } from "@/lib/forms/form-state";
import { BOOKING_FORM_FIELDS, CONTACT_FORM_FIELDS, bookingFormSchema, contactFormSchema } from "@/lib/forms/request-forms";

// Server entry points for the public forms: every field is checked again here
// with the same schemas the browser uses (Infra §2).

export async function submitContactForm(_previousState: RequestFormState, formData: FormData): Promise<RequestFormState> {
  return getRequestFormState({ schema: contactFormSchema, fields: CONTACT_FORM_FIELDS, formData });
}

export async function submitBookingForm(_previousState: RequestFormState, formData: FormData): Promise<RequestFormState> {
  return getRequestFormState({ schema: bookingFormSchema, fields: BOOKING_FORM_FIELDS, formData });
}
