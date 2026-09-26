"use client";

import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";

import { ErrorSummary } from "@/components/forms/error-summary";
import { FormField } from "@/components/forms/form-field";
import { TurnstileField } from "@/components/forms/turnstile-field";
import { useRequestForm, type RequestFormAction } from "@/components/forms/use-request-form";
import { AttributionField } from "@/components/tracking/attribution-field";
import { ButtonLink, getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { REPLY_PROMISE } from "@/lib/site/reply-promise";
import type { RequestFormSchema, RequestFormState } from "@/lib/forms/form-state";
import type { FormFieldConfig } from "@/lib/forms/request-forms";
import type { ContactLinks } from "@/lib/site/contact-links";
import type { KeyEventName } from "@/lib/tracking/data-layer";

export type RequestFormProps = {
  formId: string;
  action: RequestFormAction;
  schema: RequestFormSchema;
  fields: FormFieldConfig[];
  submitLabel: string;
  contact: ContactLinks | null;
  keyEvent: KeyEventName;
};

const NOTICE_TITLES: Record<string, string> = {
  blocked: "Please complete the quick check and send again",
  limited: "Too many messages from this connection — please wait a few minutes",
  failed: "Your message didn't send",
};

function ReachUsDirectly({ contact }: { contact: ContactLinks | null }) {
  if (!contact) return <p>We kept everything you typed. Please try again in a few minutes.</p>;
  return (
    <p>
      {"We kept everything you typed. You can also call "}
      <a href={contact.callHref} className="font-semibold underline underline-offset-4">
        {contact.displayPhone}
      </a>
      {" or email "}
      <a href={contact.emailHref} className="font-semibold break-all underline underline-offset-4">
        {contact.email}
      </a>
      .
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

// Style §11.12 success screen: badge, thanks by name, what happens next, two ways forward.
function SentConfirmation({ sentTo }: { sentTo: NonNullable<RequestFormState["sentTo"]> }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const firstName = sentTo.name.split(/\s+/)[0] ?? sentTo.name;
  return (
    <div className="grid max-w-form justify-items-start gap-6">
      <span aria-hidden className="flex size-16 items-center justify-center rounded-full border-2 border-success bg-success-tint text-success">
        <Check size={ICON_SIZE.badge} />
      </span>
      <h2 ref={headingRef} tabIndex={-1} className="type-h1 outline-none">
        {`Thanks, ${firstName}. Your message is in.`}
      </h2>
      <p className="type-lead">
        {`We'll reply ${REPLY_PROMISE}.`}
        {sentTo.email ? ` We sent a copy to ${sentTo.email}.` : ""}
      </p>
      <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
        <ButtonLink href="/listings" size="l" variant="main" isFullWidthOnMobile>
          Browse featured listings
          <ArrowRight aria-hidden size={ICON_SIZE.button} />
        </ButtonLink>
        <ButtonLink href="/" size="l" variant="secondary" isFullWidthOnMobile>
          Back to home
        </ButtonLink>
      </div>
    </div>
  );
}

export function RequestForm({ formId, action, schema, fields, submitLabel, contact, keyEvent }: RequestFormProps) {
  const form = useRequestForm(action, schema, { keyEvent });
  if (form.state.status === "sent" && form.state.sentTo) return <SentConfirmation sentTo={form.state.sentTo} />;
  return (
    <form id={formId} action={form.formAction} onSubmit={form.handleSubmit} noValidate className="grid max-w-form gap-6">
      <input type="hidden" name="idempotencyKey" value={form.idempotencyKey} />
      <AttributionField />
      {form.isSummaryVisible && <ErrorSummary formId={formId} fields={fields} fieldErrors={form.fieldErrors} focusRef={form.summaryRef} />}
      {form.isNoticeVisible && (
        <Message tone="error" title={NOTICE_TITLES[form.state.status] ?? NOTICE_TITLES.failed ?? ""} onDismiss={form.handleNoticeDismiss} focusRef={form.noticeRef}>
          <ReachUsDirectly contact={contact} />
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
      <TurnstileField action={formId} resetKey={form.state.responseId} />
      <div>
        <SubmitButton label={submitLabel} isPending={form.isPending} />
      </div>
    </form>
  );
}
