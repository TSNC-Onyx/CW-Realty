import "server-only";

import { z } from "zod";

import { fetchOpenChatSession, linkChatHandoff } from "@/lib/chat/chat-log";
import { CONTACT_NEEDED_MESSAGE, HANDOFF_FORM_FIELDS, HANDOFF_TURNSTILE_ACTION, handoffFormSchema, hasReplyContact } from "@/lib/chat/chat-schemas";
import { getHandoffBody } from "@/lib/chat/handoff-body";
import { getFieldErrors, getFieldValues, getResultState, type FieldErrors, type FieldValues, type RequestFormState } from "@/lib/forms/form-state";
import { submitNewRequest } from "@/lib/forms/intake";
import { isOverFormLimit } from "@/lib/security/rate-limit";
import { TURNSTILE_FIELD, verifyTurnstileToken } from "@/lib/security/turnstile";
import type { Visitor } from "@/lib/security/visitor";
import { getE164Phone } from "@/lib/site/phone";

// "Talk to a person" (Features §2): name, contact, and question go to the inbox through
// the same intake as the Contact form, with the chat so far attached for context.

const sessionIdSchema = z.uuid();

function getHandoffErrors(values: FieldValues): FieldErrors {
  const fieldErrors = getFieldErrors(handoffFormSchema, values);
  if (hasReplyContact(values) || fieldErrors.email) return fieldErrors;
  return { ...fieldErrors, email: CONTACT_NEEDED_MESSAGE };
}

function getSessionId(formData: FormData): string | null {
  const parsed = sessionIdSchema.safeParse(formData.get("sessionId"));
  return parsed.success ? parsed.data : null;
}

async function saveHandoff({ values, sessionId, idempotencyKey }: { values: FieldValues; sessionId: string | null; idempotencyKey: string }): Promise<void> {
  const session = sessionId ? await fetchOpenChatSession(sessionId) : null;
  const threadId = await submitNewRequest({
    source: "chat_handoff",
    contactName: (values.fullName ?? "").trim(),
    contactEmail: (values.email ?? "").trim().toLowerCase() || null,
    contactPhone: getE164Phone(values.phone ?? ""),
    subject: "Chat assistant handoff",
    body: getHandoffBody({ question: values.question ?? "", turns: session?.turns ?? [] }),
    idempotencyKey,
  });
  if (session) await linkChatHandoff({ sessionId: session.id, threadId });
}

/** Throws IntakeError or ChatLogError when saving fails; the server action reports it. */
export async function submitChatHandoff({ formData, visitor }: { formData: FormData; visitor: Visitor }): Promise<RequestFormState> {
  const values = getFieldValues(formData, HANDOFF_FORM_FIELDS);
  const fieldErrors = getHandoffErrors(values);
  if (Object.keys(fieldErrors).length > 0) return getResultState({ status: "invalid", values, fieldErrors });
  if (await isOverFormLimit(visitor.ip)) return getResultState({ status: "limited", values });
  const token = String(formData.get(TURNSTILE_FIELD) ?? "");
  const isHuman = await verifyTurnstileToken({ token, remoteIp: visitor.ip, expectedAction: HANDOFF_TURNSTILE_ACTION, expectedHostname: visitor.hostname });
  if (!isHuman) return getResultState({ status: "blocked", values });
  const idempotencyKey = String(formData.get("idempotencyKey") ?? crypto.randomUUID());
  await saveHandoff({ values, sessionId: getSessionId(formData), idempotencyKey });
  const email = (values.email ?? "").trim().toLowerCase() || null;
  return getResultState({ status: "sent", values: {}, sentTo: { name: (values.fullName ?? "").trim(), email } });
}
