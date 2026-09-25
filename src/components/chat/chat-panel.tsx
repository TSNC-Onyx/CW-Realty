"use client";

import { ArrowLeft, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatHandoffForm } from "@/components/chat/chat-handoff-form";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { useChatConversation } from "@/components/chat/use-chat-conversation";
import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Style §11.13 AI chat window: 380px panel on desktop, full screen on phones; labeled
// "AI · NOT A PERSON"; "Talk to a person" always visible. Escape closes it. While it covers
// the whole screen, Tab stays inside it (the page behind cannot be seen).

type ChatView = "chat" | "handoff";

const FULL_SCREEN_QUERY = "(width < 1024px)";
const FOCUSABLE_SELECTOR = "a[href], button:not([disabled]), textarea, input:not([type='hidden']), select, [tabindex]:not([tabindex='-1'])";

function getFocusTarget({ panel, isBackward }: { panel: HTMLElement; isBackward: boolean }): HTMLElement | null {
  const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => element.getClientRects().length > 0);
  const [first, last] = [focusable[0], focusable.at(-1)];
  if (isBackward && document.activeElement === first) return last ?? null;
  if (!isBackward && document.activeElement === last) return first ?? null;
  return null;
}

function ChatHeader({ onClose }: { onClose: () => void }) {
  return (
    <header className="tone-dark flex items-center justify-between gap-3 py-3 pr-3 pl-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image writes inline styles the CSP blocks */}
        <img src="/brand/cwr-logo-120.webp" alt="" width={32} height={32} className="size-8 rounded-full" />
        <div className="flex flex-col">
          <h2 id="chat-title" className="text-base leading-snug font-bold">CWR Assistant</h2>
          <p className="text-tag font-bold tracking-tag text-gold">AI · NOT A PERSON</p>
        </div>
      </div>
      <button type="button" onClick={onClose} aria-label="Close chat" className="flex size-11 items-center justify-center">
        <X aria-hidden size={ICON_SIZE.button} />
      </button>
    </header>
  );
}

function ViewSwitch({ view, onChange }: { view: ChatView; onChange: (view: ChatView) => void }) {
  const isChat = view === "chat";
  return (
    <div className="border-t border-line p-4 pt-3">
      <button type="button" onClick={() => onChange(isChat ? "handoff" : "chat")} className={`${getButtonClassName({ size: "s", variant: "secondary" })} w-full`}>
        {isChat ? <UserRound aria-hidden size={ICON_SIZE.button} /> : <ArrowLeft aria-hidden size={ICON_SIZE.button} />}
        {isChat ? "Talk to a person" : "Back to the assistant"}
      </button>
    </div>
  );
}

export function ChatPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const conversation = useChatConversation();
  const [view, setView] = useState<ChatView>("chat");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && view === "chat") inputRef.current?.focus();
  }, [isOpen, view]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") onClose();
    if (event.key !== "Tab" || !window.matchMedia(FULL_SCREEN_QUERY).matches) return;
    const target = getFocusTarget({ panel: event.currentTarget, isBackward: event.shiftKey });
    if (!target) return;
    event.preventDefault();
    target.focus();
  };

  return (
    <section
      role="dialog"
      aria-labelledby="chat-title"
      hidden={!isOpen}
      onKeyDown={handleKeyDown}
      className="chat-panel-enter fixed inset-0 z-50 flex flex-col border border-line bg-page lg:inset-auto lg:right-8 lg:bottom-8 lg:h-160 lg:max-h-[calc(100dvh-var(--header-height))] lg:w-95"
    >
      <ChatHeader onClose={onClose} />
      {view === "chat" ? (
        <>
          <ChatMessageList entries={conversation.entries} pendingQuestion={conversation.pendingQuestion} />
          {conversation.notice && (
            <div className="px-4 pb-2">
              <Message tone="error" title={conversation.notice} onDismiss={conversation.dismissNotice} />
            </div>
          )}
          <ChatComposer isStartingChat={conversation.sessionId === null} botCheckKey={conversation.botCheckKey} inputRef={inputRef} onSubmitQuestion={conversation.submitQuestion} />
        </>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <ChatHandoffForm sessionId={conversation.sessionId} question={conversation.latestQuestion} />
        </div>
      )}
      <ViewSwitch view={view} onChange={setView} />
    </section>
  );
}
