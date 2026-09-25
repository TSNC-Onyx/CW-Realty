"use client";

import { useEffect, useRef } from "react";

import type { ChatEntry } from "@/components/chat/use-chat-conversation";

// Style §11.13: visitor messages dark and right aligned; assistant messages on surface-soft,
// left aligned, ending with the policy source line. New messages are read out politely.

const GREETING = "Hi, I'm the CWR Assistant, an AI. I can answer questions from Charlie Ward Realty's policies. For anything else, tap “Talk to a person”.";

function VisitorBubble({ text }: { text: string }) {
  return <p className="toast-enter ml-10 self-end bg-dark px-4 py-3 text-base leading-normal whitespace-pre-wrap text-on-dark">{text}</p>;
}

function AssistantBubble({ text, citedSections }: { text: string; citedSections: string[] }) {
  return (
    <div className="toast-enter mr-10 self-start bg-surface-soft px-4 py-3 text-base leading-normal">
      <p className="whitespace-pre-wrap">{text}</p>
      {citedSections.length > 0 && <p className="mt-2 text-tag text-muted">{`Source: Policy · ${citedSections.join(", ")}`}</p>}
    </div>
  );
}

export function ChatMessageList({ entries, pendingQuestion }: { entries: ChatEntry[]; pendingQuestion: string | null }) {
  const endRef = useRef<HTMLDivElement>(null);

  // Block body on purpose: newer browsers return a Promise from scrollIntoView, and an effect
  // may only return a clean-up function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length, pendingQuestion]);

  return (
    <div role="log" aria-live="polite" aria-label="Chat messages" className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      <AssistantBubble text={GREETING} citedSections={[]} />
      {entries.map((entry) => (entry.role === "visitor" ? <VisitorBubble key={entry.id} text={entry.text} /> : <AssistantBubble key={entry.id} text={entry.text} citedSections={entry.citedSections} />))}
      {pendingQuestion !== null && (
        <>
          <VisitorBubble text={pendingQuestion} />
          <p className="self-start text-tag text-muted">The assistant is replying…</p>
        </>
      )}
      <div ref={endRef} />
    </div>
  );
}
