"use server";

import { submitChatHandoff } from "@/lib/chat/chat-handoff";
import { ChatLogError } from "@/lib/chat/chat-log";
import type { SendChatResult } from "@/lib/chat/chat-results";
import { HANDOFF_FORM_FIELDS, type ChatMessageInput } from "@/lib/chat/chat-schemas";
import { sendChatMessage } from "@/lib/chat/send-chat-message";
import { getFieldValues, getResultState, type RequestFormState } from "@/lib/forms/form-state";
import { getErrorName, reportVisitorProblem, type VisitorProblem } from "@/lib/observability/report-visitor-problem";
import { fetchVisitor } from "@/lib/security/visitor";

// Public entry points for the chat widget. Every failure is recorded by the error's name and
// the step that broke, never what the visitor typed (docs/cwr-reliability-round-plan.md §4.3).

const CHAT_FAILED_MESSAGE = "Something went wrong on our side. Try again, or tap “Talk to a person”.";

async function reportFailure({ action, error, detail }: { action: VisitorProblem["action"]; error: unknown; detail: string }): Promise<void> {
  const step = error instanceof ChatLogError ? ` (step: ${error.context.step})` : "";
  await reportVisitorProblem({ action, stage: "unexpected", severity: "error", code: getErrorName(error), detail: `${detail}${step}` });
}

export async function sendChatMessageAction(input: ChatMessageInput): Promise<SendChatResult> {
  try {
    return await sendChatMessage({ input, visitor: await fetchVisitor() });
  } catch (error) {
    await reportFailure({ action: "site.chat_message", error, detail: "A chat message failed." });
    return { status: "error", message: CHAT_FAILED_MESSAGE };
  }
}

// A failed hand-off is a lost lead, so it is an error even though the visitor can retry.
export async function submitChatHandoffAction(_previousState: RequestFormState, formData: FormData): Promise<RequestFormState> {
  try {
    return await submitChatHandoff({ formData, visitor: await fetchVisitor() });
  } catch (error) {
    await reportFailure({ action: "site.chat_handoff", error, detail: "A “Talk to a person” request could not be saved." });
    return getResultState({ status: "failed", values: getFieldValues(formData, HANDOFF_FORM_FIELDS) });
  }
}
