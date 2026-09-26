"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";

import { ErrorSummary } from "@/components/forms/error-summary";
import { FormField } from "@/components/forms/form-field";
import { TurnstileField } from "@/components/forms/turnstile-field";
import { useRequestForm } from "@/components/forms/use-request-form";
import { AttributionField } from "@/components/tracking/attribution-field";
import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { submitChatHandoffAction } from "@/lib/chat/chat-actions";
import { HANDOFF_FORM_FIELDS, HANDOFF_TURNSTILE_ACTION, handoffFormSchema } from "@/lib/chat/chat-schemas";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import type { RequestFormState } from "@/lib/forms/form-state";
import { REPLY_PROMISE } from "@/lib/site/reply-promise";

// "Talk to a person" (Features §2): name, email or phone, and the question, sent to the
// inbox; the visitor is told when to expect a reply.

const FORM_ID = "chat-handoff";
const NOTICE_TITLES: Record<string, string> = {
  blocked: "Please complete the quick check and send again",
  limited: "Too many messages from this connection — please wait a few minutes",
  failed: "Your message didn't send. We kept what you typed; try again in a moment.",
};

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

export function ChatHandoffForm({ sessionId, question }: { sessionId: string | null; question: string }) {
  const form = useRequestForm(submitChatHandoffAction, handoffFormSchema, { initialValues: { question }, keyEvent: "cwr_chat_handoff" });
  if (form.state.status === "sent" && form.state.sentTo) return <HandoffSent sentTo={form.state.sentTo} />;
  return (
    <form id={FORM_ID} action={form.formAction} onSubmit={form.handleSubmit} noValidate className="grid gap-4 overflow-y-auto p-4">
      <h3 className="type-h3">Talk to a person</h3>
      <p className="type-small">Leave your details and a person from our team will reply {REPLY_PROMISE}. Please don&apos;t include bank, card, or ID numbers.</p>
      <input type="hidden" name="idempotencyKey" value={form.idempotencyKey} />
      <input type="hidden" name="sessionId" value={sessionId ?? ""} />
      <AttributionField />
      {form.isSummaryVisible && <ErrorSummary formId={FORM_ID} fields={HANDOFF_FORM_FIELDS} fieldErrors={form.fieldErrors} focusRef={form.summaryRef} />}
      {form.isNoticeVisible && <Message tone="error" title={NOTICE_TITLES[form.state.status] ?? NOTICE_TITLES.failed ?? ""} onDismiss={form.handleNoticeDismiss} focusRef={form.noticeRef} />}
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
      <TurnstileField action={HANDOFF_TURNSTILE_ACTION} resetKey={form.state.responseId} />
      <div>
        <button type="submit" aria-busy={form.isPending} className={getButtonClassName({ size: "m", variant: "main" })}>
          {form.isPending && <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" />}
          {form.isPending ? "Sending…" : "Send to our team"}
        </button>
      </div>
    </form>
  );
}
