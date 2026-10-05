"use client";

import { MessageSquare, Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ChatEntry } from "@/components/chat/use-chat-conversation";
import { ButtonLink } from "@/components/ui/button-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { EMERGENCY_TEXT } from "@/lib/chat/handoff-text";
import type { ContactLinks } from "@/lib/site/contact-links";

// Style §11.13: visitor messages dark and right aligned; assistant messages on surface-soft,
// left aligned, ending with the policy source line. New messages are read out politely.

const SLOW_REPLY_MS = 15_000;
const REPLYING_TEXT = "The assistant is replying…";
const SLOW_REPLY_TEXT = "Thanks for waiting. This can take up to a minute. You can also tap “Talk to a person”.";
const GREETING = "Hi, and welcome! I'm the CWR Assistant, an AI helper for Charlie Ward Realty. I'm happy to answer questions about buying, selling, renting, or property management in the Triad. What can I help you with today?";

function VisitorBubble({ text }: { text: string }) {
  return <p className="toast-enter ml-10 self-end bg-dark px-4 py-3 text-base leading-normal whitespace-pre-wrap text-on-dark">{text}</p>;
}

// Under the emergency reply: the office's call and text links (docs/cwr-chat-emergency-reply-plan.md).
function EmergencyContactLinks({ contact }: { contact: ContactLinks | null }) {
  if (!contact) return null;
  return (
    <div className="mt-3 grid gap-2">
      <ButtonLink href={contact.callHref} size="m" variant="main">
        <Phone aria-hidden size={ICON_SIZE.button} />
        {`Call ${contact.displayPhone}`}
      </ButtonLink>
      <ButtonLink href={contact.textHref} size="m" variant="secondary">
        <MessageSquare aria-hidden size={ICON_SIZE.button} />
        Text us
      </ButtonLink>
    </div>
  );
}

// contact: set only on the latest emergency reply, so the call and text links appear once.
function AssistantBubble({ text, citedSections, contact = null }: { text: string; citedSections: string[]; contact?: ContactLinks | null }) {
  return (
    <div className="toast-enter mr-10 self-start bg-surface-soft px-4 py-3 text-base leading-normal">
      <p className="whitespace-pre-wrap">{text}</p>
      <EmergencyContactLinks contact={contact} />
      {citedSections.length > 0 && <p className="mt-2 text-tag text-muted">{`Source: Policy · ${citedSections.join(", ")}`}</p>}
    </div>
  );
}

// Mounted per question, so the 15-second clock starts fresh each time.
function PendingReplyLine() {
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setIsSlow(true), SLOW_REPLY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return <p className="self-start text-tag text-muted">{isSlow ? SLOW_REPLY_TEXT : REPLYING_TEXT}</p>;
}

type ChatMessageListProps = { entries: ChatEntry[]; pendingQuestion: string | null; contact: ContactLinks | null };

export function ChatMessageList({ entries, pendingQuestion, contact }: ChatMessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const latestEmergencyId = entries.findLast((entry) => entry.role === "assistant" && entry.text === EMERGENCY_TEXT)?.id ?? null;

  // Block body on purpose: newer browsers return a Promise from scrollIntoView, and an effect
  // may only return a clean-up function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length, pendingQuestion]);

  return (
    <div role="log" aria-live="polite" aria-label="Chat messages" className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      <AssistantBubble text={GREETING} citedSections={[]} />
      {entries.map((entry) => (entry.role === "visitor" ? <VisitorBubble key={entry.id} text={entry.text} /> : <AssistantBubble key={entry.id} text={entry.text} citedSections={entry.citedSections} contact={entry.id === latestEmergencyId ? contact : null} />))}
      {pendingQuestion !== null && (
        <>
          <VisitorBubble text={pendingQuestion} />
          <PendingReplyLine />
        </>
      )}
      <div ref={endRef} />
    </div>
  );
}
