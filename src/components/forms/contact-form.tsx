"use client";

import { submitContactForm } from "@/lib/forms/submit-actions";
import { RequestForm } from "@/components/forms/request-form";
import { withRequestFormReporting } from "@/components/forms/request-form-reporting";
import { CONTACT_FORM_FIELDS, contactFormSchema } from "@/lib/forms/request-forms";
import type { ContactLinks } from "@/lib/site/contact-links";

const reportedSubmitContactForm = withRequestFormReporting({ problemAction: "site.contact_form", fields: CONTACT_FORM_FIELDS }, submitContactForm);

export function ContactForm({ contact }: { contact: ContactLinks | null }) {
  return (
    <RequestForm
      formId="contact-form"
      problemAction="site.contact_form"
      action={reportedSubmitContactForm}
      schema={contactFormSchema}
      fields={CONTACT_FORM_FIELDS}
      submitLabel="Send message"
      contact={contact}
      keyEvent="cwr_contact_form"
    />
  );
}
