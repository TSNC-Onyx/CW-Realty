"use client";

import { submitBookingForm } from "@/lib/forms/submit-actions";
import { RequestForm } from "@/components/forms/request-form";
import { BOOKING_FORM_FIELDS, bookingFormSchema } from "@/lib/forms/request-forms";
import type { ContactLinks } from "@/lib/site/contact-links";

export function BookingForm({ contact }: { contact: ContactLinks | null }) {
  return (
    <RequestForm
      formId="touchup-request-form"
      action={submitBookingForm}
      schema={bookingFormSchema}
      fields={BOOKING_FORM_FIELDS}
      submitLabel="Request a TouchUp visit"
      contact={contact}
      keyEvent="cwr_booking_request"
    />
  );
}
