"use client";

import { LoaderCircle, SendHorizontal } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent, type Ref } from "react";

import { TurnstileField } from "@/components/forms/turnstile-field";
import { getButtonClassName } from "@/components/ui/button-link";
import { CHAT_TURNSTILE_ACTION, MAX_CHAT_MESSAGE_LENGTH } from "@/lib/chat/chat-schemas";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { TURNSTILE_FIELD } from "@/lib/security/turnstile-field-name";

// The question box. Enter sends, Shift+Enter adds a line. The bot check runs only while
// starting a new chat; after that the chat's own id is enough.

type ChatComposerProps = {
  isStartingChat: boolean;
  botCheckKey: string;
  inputRef: Ref<HTMLTextAreaElement>;
  onSubmitQuestion: (request: { question: string; turnstileToken: string }) => Promise<boolean>;
};

export function ChatComposer({ isStartingChat, botCheckKey, inputRef, onSubmitQuestion }: ChatComposerProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

  const sendDraft = async (form: HTMLFormElement) => {
    const question = draft.trim();
    if (question === "" || isSending) return;
    setIsSending(true);
    const isAnswered = await onSubmitQuestion({ question, turnstileToken: String(new FormData(form).get(TURNSTILE_FIELD) ?? "") });
    setIsSending(false);
    if (isAnswered) setDraft("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendDraft(event.currentTarget);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (event.currentTarget.form) void sendDraft(event.currentTarget.form);
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 border-t border-line p-4">
      <label htmlFor="chat-question" className="text-base font-bold">
        Your question
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="chat-question"
          ref={inputRef}
          rows={2}
          value={draft}
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          className="field-input min-h-13 flex-1 resize-none"
        />
        <button type="submit" aria-busy={isSending} className={`${getButtonClassName({ size: "s", variant: "main" })} px-4`}>
          {isSending ? <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" /> : <SendHorizontal aria-hidden size={ICON_SIZE.button} />}
          Send
        </button>
      </div>
      {isStartingChat && <TurnstileField action={CHAT_TURNSTILE_ACTION} resetKey={botCheckKey} />}
    </form>
  );
}
