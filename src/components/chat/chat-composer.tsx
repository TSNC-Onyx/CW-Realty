"use client";

import { LoaderCircle, SendHorizontal } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent, type Ref } from "react";

import { PageRefreshNotice } from "@/components/forms/page-refresh-notice";
import { CallUsLink, ReachUsDirectly } from "@/components/forms/reach-us-directly";
import { TurnstileField } from "@/components/forms/turnstile-field";
import { useBotCheck } from "@/components/forms/use-bot-check";
import { useFormRestore } from "@/components/forms/use-form-restore";
import { getButtonClassName } from "@/components/ui/button-link";
import { CHAT_TURNSTILE_ACTION, MAX_CHAT_MESSAGE_LENGTH } from "@/lib/chat/chat-schemas";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { reportVisitorClientProblem } from "@/lib/observability/report-client-problem";
import { BOT_CHECK_KEY_FIELD } from "@/lib/security/bot-check-key";
import { TURNSTILE_FIELD } from "@/lib/security/turnstile-field-name";
import type { ContactLinks } from "@/lib/site/contact-links";

// The question box. Enter sends, Shift+Enter adds a line. The Quick Check runs only while
// starting a new chat; after that the chat's own id is enough. A press made while the check
// is still running is held and sent once it passes. The box empties on Send and stays locked
// until the reply arrives; a failed send puts the question back. An out-of-date page offers
// Refresh page, keeping the question typed so far.

const FORM_ID = "chat-composer";
const DRAFT_FIELD = "question";

type ChatComposerProps = {
  isStartingChat: boolean;
  isOutdated: boolean;
  botCheckKey: string;
  contact: ContactLinks | null;
  inputRef: Ref<HTMLTextAreaElement>;
  onSubmitQuestion: (request: { question: string; turnstileToken: string; botCheckKey: string }) => Promise<boolean>;
};

function getFormText(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? "");
}

export function ChatComposer({ isStartingChat, isOutdated, botCheckKey, contact, inputRef, onSubmitQuestion }: ChatComposerProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const botCheck = useBotCheck({ problemAction: "site.bot_check_widget", reportProblem: reportVisitorClientProblem, resetKey: botCheckKey, isEnabled: isStartingChat });
  useFormRestore({ formId: FORM_ID, fieldNames: [DRAFT_FIELD], onRestore: (restored) => setDraft(restored[DRAFT_FIELD] ?? "") });

  const sendDraft = async (form: HTMLFormElement) => {
    const question = draft.trim();
    if (question === "" || isSending) return;
    // Read the form before emptying the box: the question already shows in the conversation.
    const request = { question, turnstileToken: getFormText(form, TURNSTILE_FIELD), botCheckKey: getFormText(form, BOT_CHECK_KEY_FIELD) };
    setIsSending(true);
    setDraft("");
    const isAnswered = await onSubmitQuestion(request);
    setIsSending(false);
    // A failed send gives the question back, so the visitor never has to retype it.
    if (!isAnswered) setDraft(question);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.trim() === "" || isSending) return;
    if (!botCheck.handleSubmitAttempt(event.currentTarget)) return;
    void sendDraft(event.currentTarget);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const handleRefreshLoop = () => void reportVisitorClientProblem({ action: "site.chat_widget", stage: "browser", severity: "warning", code: "outdated_page_loop" });
  const isBusy = isSending || botCheck.isHolding;

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} className="grid gap-2 border-t border-line p-4">
      {isOutdated && <PageRefreshNotice formId={FORM_ID} mode="button" getValues={() => ({ [DRAFT_FIELD]: draft })} onRefreshLoop={handleRefreshLoop} fallback={<ReachUsDirectly contact={contact} />} />}
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
          readOnly={isBusy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          className="field-input min-h-13 flex-1 resize-none"
        />
        <button type="submit" aria-busy={isBusy} className={`${getButtonClassName({ size: "s", variant: "main" })} px-4`}>
          {isBusy ? <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" /> : <SendHorizontal aria-hidden size={ICON_SIZE.button} />}
          Send
        </button>
      </div>
      {isStartingChat && <TurnstileField action={CHAT_TURNSTILE_ACTION} botCheck={botCheck} fallback={<CallUsLink contact={contact} />} />}
    </form>
  );
}
