"use client";

import { LoaderCircle } from "lucide-react";

import { ErrorSummary } from "@/components/forms/error-summary";
import { FormField } from "@/components/forms/form-field";
import { useRequestForm, type RequestFormAction } from "@/components/forms/use-request-form";
import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import type { RequestFormSchema } from "@/lib/forms/form-state";
import type { FormFieldConfig } from "@/lib/forms/request-forms";
import type { ContactLinks } from "@/lib/site/contact-links";

export type RequestFormProps = {
  formId: string;
  action: RequestFormAction;
  schema: RequestFormSchema;
  fields: FormFieldConfig[];
  submitLabel: string;
  contact: ContactLinks | null;
};

function UnavailableNoticeBody({ contact }: { contact: ContactLinks | null }) {
  if (!contact) return <p>We kept everything you typed. Please try again later.</p>;
  return (
    <p>
      {"We kept everything you typed. For now, please call "}
      <a href={contact.callHref} className="font-semibold underline underline-offset-4">
        {contact.displayPhone}
      </a>
      {" or email "}
      <a href={contact.emailHref} className="font-semibold break-all underline underline-offset-4">
        {contact.email}
      </a>
      {" and we'll help right away."}
    </p>
  );
}

function SubmitButton({ label, isPending }: { label: string; isPending: boolean }) {
  return (
    <button type="submit" aria-busy={isPending} className={getButtonClassName({ size: "l", variant: "main", isFullWidthOnMobile: true })}>
      {isPending && <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" />}
      {isPending ? "Sending…" : label}
    </button>
  );
}

export function RequestForm({ formId, action, schema, fields, submitLabel, contact }: RequestFormProps) {
  const form = useRequestForm(action, schema);
  return (
    <form id={formId} action={form.formAction} onSubmit={form.handleSubmit} noValidate className="grid max-w-form gap-6">
      {form.isSummaryVisible && (
        <ErrorSummary formId={formId} fields={fields} fieldErrors={form.fieldErrors} focusRef={form.summaryRef} />
      )}
      {form.isNoticeVisible && (
        <Message tone="info" title="Online requests open soon" onDismiss={form.handleNoticeDismiss} focusRef={form.noticeRef}>
          <UnavailableNoticeBody contact={contact} />
        </Message>
      )}
      {fields.map((field) => (
        <FormField
          key={field.name}
          formId={formId}
          field={field}
          value={form.values[field.name] ?? ""}
          error={form.fieldErrors[field.name] ?? null}
          isFixed={form.fixedFields.has(field.name)}
          onValueChange={form.handleValueChange}
          onFieldBlur={form.handleFieldBlur}
        />
      ))}
      <div>
        <SubmitButton label={submitLabel} isPending={form.isPending} />
      </div>
    </form>
  );
}
