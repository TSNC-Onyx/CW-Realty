"use server";

import { submitChatHandoff } from "@/lib/chat/chat-handoff";
import type { SendChatResult } from "@/lib/chat/chat-results";
import { HANDOFF_FORM_FIELDS, type ChatMessageInput } from "@/lib/chat/chat-schemas";
import { sendChatMessage } from "@/lib/chat/send-chat-message";
import { getFieldValues, getResultState, type RequestFormState } from "@/lib/forms/form-state";
import { fetchVisitor } from "@/lib/security/visitor";

// Public entry points for the chat widget. Failures are logged by error name only:
// details could repeat what the visitor typed.

const CHAT_FAILED_MESSAGE = "Something went wrong on our side. Try again, or tap “Talk to a person”.";

function logFailure(message: string, error: unknown): void {
  console.error(JSON.stringify({ message, error: error instanceof Error ? error.name : "unknown" }));
}

export async function sendChatMessageAction(input: ChatMessageInput): Promise<SendChatResult> {
  try {
    return await sendChatMessage({ input, visitor: await fetchVisitor() });
  } catch (error) {
    logFailure("Chat message failed", error);
    return { status: "error", message: CHAT_FAILED_MESSAGE };
  }
}

export async function submitChatHandoffAction(_previousState: RequestFormState, formData: FormData): Promise<RequestFormState> {
  try {
    return await submitChatHandoff({ formData, visitor: await fetchVisitor() });
  } catch (error) {
    logFailure("Chat handoff failed", error);
    return getResultState({ status: "failed", values: getFieldValues(formData, HANDOFF_FORM_FIELDS) });
  }
}
