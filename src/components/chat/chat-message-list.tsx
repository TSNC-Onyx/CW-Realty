"use client";

import { ArrowRight, MessageSquare, Phone } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { markChatLinkFollowed } from "@/components/chat/chat-link-reopen";
import type { ChatEntry } from "@/components/chat/use-chat-conversation";
import { ButtonLink } from "@/components/ui/button-link";
import { getGuidedNode, type GuidedLink } from "@/lib/chat/guided-tree";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { EMERGENCY_TEXT } from "@/lib/chat/handoff-text";
import type { ContactLinks } from "@/lib/site/contact-links";

// Style §11.13: visitor messages dark and right aligned; assistant messages on surface-soft,
// left aligned, ending with the policy source line. New messages are read out politely.
// A new answer scrolls to its first line, so a long one is never cut off at its start; a topic
// answer also takes focus, since the button that was tapped is gone
// (docs/cwr-chat-guided-options-plan.md §4).

// Room left above a new answer when it scrolls to the top of the message area.
const ANSWER_TOP_GAP_PX = 16;

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

// A topic answer's page link. Following it reopens the chat on that page (computers and tablets).
function TopicLink({ link }: { link: GuidedLink }) {
  return (
    <Link href={link.href} onClick={() => markChatLinkFollowed(link.href)} className="text-link mt-3 inline-flex min-h-11 items-center">
      {link.label}
      <ArrowRight aria-hidden size={ICON_SIZE.inline} />
    </Link>
  );
}

type AssistantBubbleProps = { entryId?: string; text: string; citedSections: string[]; topicId?: string; contact?: ContactLinks | null };

// contact: set only on the latest emergency reply, so the call and text links appear once.
function AssistantBubble({ entryId, text, citedSections, topicId, contact = null }: AssistantBubbleProps) {
  const link = topicId ? getGuidedNode(topicId)?.link : undefined;
  return (
    <div data-entry-id={entryId} tabIndex={entryId ? -1 : undefined} className="toast-enter mr-10 self-start bg-surface-soft px-4 py-3 text-base leading-normal">
      <p className="whitespace-pre-wrap">{text}</p>
      <EmergencyContactLinks contact={contact} />
      {link && <TopicLink link={link} />}
      {citedSections.length > 0 && <p className="mt-2 text-tag text-muted">{`Source: Policy · ${citedSections.join(", ")}`}</p>}
    </div>
  );
}

// A topic answer's short pause: three dots that fade in turn (still under reduced motion).
function TopicReplyingLine() {
  return (
    <p className="flex items-center gap-2 self-start text-tag text-muted">
      <span aria-hidden className="flex gap-1">
        <span className="chat-typing-dot size-2 rounded-full bg-muted" />
        <span className="chat-typing-dot size-2 rounded-full bg-muted" />
        <span className="chat-typing-dot size-2 rounded-full bg-muted" />
      </span>
      {REPLYING_TEXT}
    </p>
  );
}

/** Puts a new answer's first line at the top of the message area; a topic answer also takes focus. */
function showNewAnswer({ log, entry }: { log: HTMLElement; entry: ChatEntry }): void {
  const bubble = log.querySelector<HTMLElement>(`[data-entry-id="${entry.id}"]`);
  if (!bubble) return;
  log.scrollTop += bubble.getBoundingClientRect().top - log.getBoundingClientRect().top - ANSWER_TOP_GAP_PX;
  // Never pulls focus out of a box the visitor has started typing in.
  const isTyping = document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement;
  if (entry.source === "guided" && !isTyping) bubble.focus({ preventScroll: true });
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

type ChatMessageListProps = { entries: ChatEntry[]; pendingQuestion: string | null; isTopicReplying: boolean; contact: ContactLinks | null };

export function ChatMessageList({ entries, pendingQuestion, isTopicReplying, contact }: ChatMessageListProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Messages already shown: a chat restored on opening scrolls to its end and leaves focus alone.
  const shownCountRef = useRef(entries.length);
  const latestEmergencyId = entries.findLast((entry) => entry.role === "assistant" && entry.text === EMERGENCY_TEXT)?.id ?? null;

  // Block body on purpose: newer browsers return a Promise from scrollIntoView, and an effect
  // may only return a clean-up function.
  useEffect(() => {
    const isNewMessage = entries.length > shownCountRef.current;
    shownCountRef.current = entries.length;
    const lastEntry = entries.at(-1);
    if (isNewMessage && lastEntry?.role === "assistant" && pendingQuestion === null && logRef.current) {
      showNewAnswer({ log: logRef.current, entry: lastEntry });
    } else {
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [entries, pendingQuestion, isTopicReplying]);

  return (
    <div ref={logRef} role="log" aria-live="polite" aria-label="Chat messages" className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
      <AssistantBubble text={GREETING} citedSections={[]} />
      {entries.map((entry) =>
        entry.role === "visitor" ? (
          <VisitorBubble key={entry.id} text={entry.text} />
        ) : (
          <AssistantBubble key={entry.id} entryId={entry.id} text={entry.text} citedSections={entry.citedSections} topicId={entry.topicId} contact={entry.id === latestEmergencyId ? contact : null} />
        ),
      )}
      {isTopicReplying && <TopicReplyingLine />}
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
