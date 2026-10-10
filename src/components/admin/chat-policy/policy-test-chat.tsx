"use client";

import { LoaderCircle, RotateCcw, SendHorizontal } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";

import { useTryInChatRequest } from "@/components/admin/chat-policy/policy-page-events";
import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { sendTestChatAction, type TestChatInput, type TestChatResult } from "@/lib/admin/chat-policy/test-chat-actions";
import type { ChatTurn } from "@/lib/chat/answer-question";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/chat/chat-schemas";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { getCallFailure, getErrorDigest } from "@/lib/observability/call-server-action";
import { reportClientProblem } from "@/lib/observability/report-client-problem";

// Live test chat (Admin §6): asks the assistant using the text currently in the editor.
// A call that fails outright (stale page, dropped connection) becomes a message and is
// recorded, so the chat never stays stuck on "Asking…".

type TestTurn = ChatTurn & { id: string; citedSections: string[] };

async function fetchTestChatResult(input: TestChatInput): Promise<TestChatResult> {
  try {
    return await sendTestChatAction(input);
  } catch (error) {
    unstable_rethrow(error);
    const failure = getCallFailure(error);
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const reference = await reportClientProblem({ action: "chat_policy.test_chat", stage: "network", severity: failure.severity, code: failure.code, shownMessage: failure.message, detail, digest: getErrorDigest(error) });
    return { status: "error", message: reference ? `${failure.message} (Ref ${reference})` : failure.message };
  }
}

export function PolicyTestChat({ policyBody }: { policyBody: string }) {
  const [turns, setTurns] = useState<TestTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // A failed test's "Try it in the test chat": the question goes in the box, ready to send.
  const handleTryRequest = useCallback((question: string) => {
    setDraft(question.slice(0, MAX_CHAT_MESSAGE_LENGTH));
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: "center" });
  }, []);
  useTryInChatRequest(handleTryRequest);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = draft.trim();
    if (question === "" || isPending) return;
    setIsPending(true);
    setError(null);
    const history = turns.map(({ role, body }) => ({ role, body }));
    const result = await fetchTestChatResult({ policyBody, turns: [...history, { role: "visitor", body: question }] });
    setIsPending(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setDraft("");
    setTurns((current) => [...current, { id: crypto.randomUUID(), role: "visitor", body: question, citedSections: [] }, { id: crypto.randomUUID(), role: "assistant", body: result.reply.text, citedSections: result.reply.citedSections }]);
  };

  return (
    <section aria-labelledby="test-chat-heading" className="mt-10 border-t-2 border-ink pt-6">
      <h2 id="test-chat-heading" className="type-h3 mb-2">Try it: live test chat</h2>
      <p className="mb-4 max-w-prose">Ask questions the way a visitor would. The assistant uses the text in the editor above, even before you save. Test chats are not logged.</p>
      <ol aria-live="polite" className="mb-4 grid max-w-prose gap-3">
        {turns.map((turn) => (
          <li key={turn.id} className={turn.role === "visitor" ? "ml-10 bg-dark px-4 py-3 text-on-dark" : "mr-10 bg-surface-soft px-4 py-3"}>
            <span className="sr-only">{turn.role === "visitor" ? "You: " : "Assistant: "}</span>
            <span className="whitespace-pre-wrap">{turn.body}</span>
            {turn.citedSections.length > 0 && <span className="mt-2 block text-tag text-muted">{`Source: Policy · ${turn.citedSections.join(", ")}`}</span>}
          </li>
        ))}
      </ol>
      {error && (
        <div className="mb-4 max-w-prose">
          <Message tone="error" title={error} onDismiss={() => setError(null)} />
        </div>
      )}
      <form onSubmit={handleSubmit} className="grid max-w-prose gap-2">
        <label htmlFor="test-chat-question" className="text-base font-bold">Test question</label>
        <input ref={inputRef} id="test-chat-question" value={draft} maxLength={MAX_CHAT_MESSAGE_LENGTH} onChange={(event) => setDraft(event.target.value)} className="field-input" />
        <div className="flex flex-wrap gap-3">
          <button type="submit" aria-busy={isPending} className={getButtonClassName({ size: "m", variant: "main" })}>
            {isPending ? <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" /> : <SendHorizontal aria-hidden size={ICON_SIZE.button} />}
            {isPending ? "Asking…" : "Ask"}
          </button>
          {turns.length > 0 && (
            <button type="button" onClick={() => setTurns([])} className={getButtonClassName({ size: "m", variant: "secondary" })}>
              <RotateCcw aria-hidden size={ICON_SIZE.button} />
              Start over
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
