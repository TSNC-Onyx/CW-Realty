"use client";

import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";

import { ErrorSummary } from "@/components/forms/error-summary";
import { FormField } from "@/components/forms/form-field";
import { PageRefreshNotice, RefreshPageButton } from "@/components/forms/page-refresh-notice";
import { CallUsLink, ReachUsDirectly } from "@/components/forms/reach-us-directly";
import { TurnstileField } from "@/components/forms/turnstile-field";
import { useBotCheck } from "@/components/forms/use-bot-check";
import { useFormRestore } from "@/components/forms/use-form-restore";
import { useRequestForm, type RequestFormAction } from "@/components/forms/use-request-form";
import { AttributionField } from "@/components/tracking/attribution-field";
import { ButtonLink, getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { REPLY_PROMISE } from "@/lib/site/reply-promise";
import { isNoticeStatus, type NoticeStatus, type RequestFormSchema, type RequestFormState, type RequestFormStatus } from "@/lib/forms/form-state";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { reportVisitorClientProblem } from "@/lib/observability/report-client-problem";
import { BOT_CHECK_MESSAGES } from "@/lib/security/bot-check-messages";
import type { FormFieldConfig } from "@/lib/forms/request-forms";
import type { ContactLinks } from "@/lib/site/contact-links";
import type { KeyEventName } from "@/lib/tracking/data-layer";

export type RequestFormProps = {
  formId: string;
  /** Where this form's problems are recorded. */
  problemAction: Extract<ProblemAction, `site.${string}`>;
  action: RequestFormAction;
  schema: RequestFormSchema;
  fields: FormFieldConfig[];
  submitLabel: string;
  contact: ContactLinks | null;
  keyEvent: KeyEventName;
};

const NOTICE_TITLES = {
  blocked: BOT_CHECK_MESSAGES.refused,
  limited: "Too many messages from this connection — please wait a few minutes",
  failed: "Your message didn't send",
} satisfies Record<NoticeStatus, string>;

function getNoticeTitle(status: RequestFormStatus): string {
  return isNoticeStatus(status) ? NOTICE_TITLES[status] : NOTICE_TITLES.failed;
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

export function RequestForm({ formId, problemAction, action, schema, fields, submitLabel, contact, keyEvent }: RequestFormProps) {
  const form = useRequestForm(action, schema, { keyEvent });
  const botCheck = useBotCheck({ problemAction: "site.bot_check_widget", reportProblem: reportVisitorClientProblem, resetKey: form.state.responseId });
  useFormRestore({ formId, fieldNames: fields.map((field) => field.name), onRestore: form.restoreValues });
  if (form.state.status === "sent" && form.state.sentTo) return <SentConfirmation sentTo={form.state.sentTo} />;

  // Fields are checked first; then a press made while the Quick Check is still running is held.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    form.handleSubmit(event);
    if (!event.defaultPrevented && !botCheck.handleSubmitAttempt(event.currentTarget)) event.preventDefault();
  };
  const handleRefreshLoop = () => void reportVisitorClientProblem({ action: problemAction, stage: "browser", severity: "warning", code: "outdated_page_loop" });
  const getValues = () => form.values;

  return (
    <form id={formId} action={form.formAction} onSubmit={handleSubmit} noValidate className="grid max-w-form gap-6">
      <input type="hidden" name="idempotencyKey" value={form.idempotencyKey} />
      <AttributionField />
      {form.isSummaryVisible && <ErrorSummary formId={formId} fields={fields} fieldErrors={form.fieldErrors} focusRef={form.summaryRef} />}
      {form.isNoticeVisible && form.state.recovery === "refresh" && (
        <PageRefreshNotice formId={formId} mode="button" getValues={getValues} onRefreshLoop={handleRefreshLoop} fallback={<ReachUsDirectly contact={contact} />} />
      )}
      {form.isNoticeVisible && form.state.recovery !== "refresh" && (
        <Message tone="error" title={getNoticeTitle(form.state.status)} onDismiss={form.handleNoticeDismiss} focusRef={form.noticeRef}>
          <ReachUsDirectly contact={contact} />
          {form.state.status === "blocked" && <RefreshPageButton formId={formId} getValues={getValues} />}
        </Message>
      )}
      <div inert={botCheck.isHolding} className="contents">
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
      </div>
      <TurnstileField action={formId} botCheck={botCheck} fallback={<CallUsLink contact={contact} />} />
      <div>
        <SubmitButton label={submitLabel} isPending={form.isPending || botCheck.isHolding} />
      </div>
    </form>
  );
}
