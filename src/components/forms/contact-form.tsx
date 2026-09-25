"use client";

import { submitContactForm } from "@/lib/forms/submit-actions";
import { RequestForm } from "@/components/forms/request-form";
import { CONTACT_FORM_FIELDS, contactFormSchema } from "@/lib/forms/request-forms";
import type { ContactLinks } from "@/lib/site/contact-links";

export function ContactForm({ contact }: { contact: ContactLinks | null }) {
  return (
    <RequestForm
      formId="contact-form"
      action={submitContactForm}
      schema={contactFormSchema}
      fields={CONTACT_FORM_FIELDS}
      submitLabel="Send message"
      contact={contact}
    />
  );
}
