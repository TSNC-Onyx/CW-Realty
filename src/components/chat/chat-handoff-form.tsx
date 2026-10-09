"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";

import { ErrorSummary } from "@/components/forms/error-summary";
import { FormField } from "@/components/forms/form-field";
import { PageRefreshNotice, RefreshPageButton } from "@/components/forms/page-refresh-notice";
import { CallUsLink, ReachUsDirectly } from "@/components/forms/reach-us-directly";
import { withRequestFormReporting } from "@/components/forms/request-form-reporting";
import { TurnstileField } from "@/components/forms/turnstile-field";
import { useBotCheck } from "@/components/forms/use-bot-check";
import { useFormRestore } from "@/components/forms/use-form-restore";
import { useRequestForm } from "@/components/forms/use-request-form";
import { AttributionField } from "@/components/tracking/attribution-field";
import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { submitChatHandoffAction } from "@/lib/chat/chat-actions";
import { HANDOFF_FORM_FIELDS, HANDOFF_TURNSTILE_ACTION, handoffFormSchema } from "@/lib/chat/chat-schemas";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { isNoticeStatus, type NoticeStatus, type RequestFormState, type RequestFormStatus } from "@/lib/forms/form-state";
import { reportVisitorClientProblem } from "@/lib/observability/report-client-problem";
import { BOT_CHECK_MESSAGES } from "@/lib/security/bot-check-messages";
import type { ContactLinks } from "@/lib/site/contact-links";
import { REPLY_PROMISE } from "@/lib/site/reply-promise";

// "Talk to a person" (Features §2): name, email or phone, and the question, sent to the
// inbox; the visitor is told when to expect a reply.

const FORM_ID = "chat-handoff";
const FIELD_NAMES = HANDOFF_FORM_FIELDS.map((field) => field.name);

const NOTICE_TITLES = {
  blocked: BOT_CHECK_MESSAGES.refused,
  limited: "Too many messages from this connection — please wait a few minutes",
  failed: "Your message didn't send.",
} satisfies Record<NoticeStatus, string>;

const reportedSubmitChatHandoff = withRequestFormReporting({ problemAction: "site.chat_handoff", fields: HANDOFF_FORM_FIELDS }, submitChatHandoffAction);

function getNoticeTitle(status: RequestFormStatus): string {
  return isNoticeStatus(status) ? NOTICE_TITLES[status] : NOTICE_TITLES.failed;
}

function handleRefreshLoop(): void {
  void reportVisitorClientProblem({ action: "site.chat_handoff", stage: "browser", severity: "warning", code: "outdated_page_loop" });
}

function HandoffSent({ sentTo }: { sentTo: NonNullable<RequestFormState["sentTo"]> }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const firstName = sentTo.name.split(/\s+/)[0] ?? sentTo.name;
  return (
    <div className="grid justify-items-start gap-4 p-4">
      <span aria-hidden className="flex size-16 items-center justify-center rounded-full border-2 border-success bg-success-tint text-success">
        <Check size={ICON_SIZE.badge} />
      </span>
      <h3 ref={headingRef} tabIndex={-1} className="type-h3 outline-none">{`Thanks, ${firstName}. A person will reply.`}</h3>
      <p>{`Someone from our team will get back to you ${REPLY_PROMISE}.${sentTo.email ? ` We sent a copy to ${sentTo.email}.` : ""}`}</p>
    </div>
  );
}

type ChatHandoffFormProps = { sessionId: string | null; question: string; contact: ContactLinks | null };

export function ChatHandoffForm({ sessionId, question, contact }: ChatHandoffFormProps) {
  const form = useRequestForm(reportedSubmitChatHandoff, handoffFormSchema, { initialValues: { question }, keyEvent: "cwr_chat_handoff" });
  const botCheck = useBotCheck({ problemAction: "site.bot_check_widget", reportProblem: reportVisitorClientProblem, resetKey: form.state.responseId });
  useFormRestore({ formId: FORM_ID, fieldNames: FIELD_NAMES, onRestore: form.restoreValues });
  if (form.state.status === "sent" && form.state.sentTo) return <HandoffSent sentTo={form.state.sentTo} />;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    form.handleSubmit(event);
    if (!event.defaultPrevented && !botCheck.handleSubmitAttempt(event.currentTarget)) event.preventDefault();
  };
  const getValues = () => form.values;

  return (
    <form id={FORM_ID} action={form.formAction} onSubmit={handleSubmit} noValidate className="grid gap-4 overflow-y-auto p-4">
      <h3 className="type-h3">Talk to a person</h3>
      <p className="type-small">Leave your details and a person from our team will reply {REPLY_PROMISE}. Please don&apos;t include bank, card, or ID numbers.</p>
      <input type="hidden" name="idempotencyKey" value={form.idempotencyKey} />
      <input type="hidden" name="sessionId" value={sessionId ?? ""} />
      <AttributionField />
      {form.isSummaryVisible && <ErrorSummary formId={FORM_ID} fields={HANDOFF_FORM_FIELDS} fieldErrors={form.fieldErrors} focusRef={form.summaryRef} />}
      {form.isNoticeVisible && form.state.recovery === "refresh" && <PageRefreshNotice formId={FORM_ID} mode="button" getValues={getValues} onRefreshLoop={handleRefreshLoop} fallback={<ReachUsDirectly contact={contact} />} />}
      {form.isNoticeVisible && form.state.recovery !== "refresh" && (
        <Message tone="error" title={getNoticeTitle(form.state.status)} onDismiss={form.handleNoticeDismiss} focusRef={form.noticeRef}>
          <ReachUsDirectly contact={contact} />
          {form.state.status === "blocked" && <RefreshPageButton formId={FORM_ID} getValues={getValues} />}
        </Message>
      )}
      <div inert={botCheck.isHolding} className="contents">
        {HANDOFF_FORM_FIELDS.map((field) => (
          <FormField
            key={field.name}
            formId={FORM_ID}
            field={field}
            value={form.values[field.name] ?? ""}
            error={form.fieldErrors[field.name] ?? null}
            isFixed={form.fixedFields.has(field.name)}
            onValueChange={form.handleValueChange}
            onFieldBlur={form.handleFieldBlur}
          />
        ))}
      </div>
      <TurnstileField action={HANDOFF_TURNSTILE_ACTION} botCheck={botCheck} fallback={<CallUsLink contact={contact} />} />
      <div>
        <button type="submit" aria-busy={form.isPending || botCheck.isHolding} className={getButtonClassName({ size: "m", variant: "main" })}>
          {(form.isPending || botCheck.isHolding) && <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" />}
          {form.isPending || botCheck.isHolding ? "Sending…" : "Send to our team"}
        </button>
      </div>
    </form>
  );
}
