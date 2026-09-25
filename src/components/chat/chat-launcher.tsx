"use client";

import { MessageCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { OPEN_CHAT_EVENT, openChat } from "@/components/chat/chat-events";
import { getButtonClassName } from "@/components/ui/button-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Features §2: only this small launcher ships with the page; the chat panel, its bot check,
// and its server calls load the first time a visitor opens it.

const ChatPanel = dynamic(() => import("@/components/chat/chat-panel").then((module) => module.ChatPanel), { ssr: false });

export function ChatLauncher() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleOpen = () => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setHasOpened(true);
      setIsOpen(true);
    };
    window.addEventListener(OPEN_CHAT_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, handleOpen);
  }, []);

  // The launcher must be visible again before it can take focus back.
  const handleClose = () => {
    flushSync(() => setIsOpen(false));
    returnFocusRef.current?.focus();
  };

  return (
    <>
      {/* Hidden, not removed, while the chat is open, so closing can return focus to it. */}
      <button type="button" onClick={openChat} hidden={isOpen} className={`${getButtonClassName({ size: "m", variant: "main", tone: "dark" })} fixed right-8 bottom-8 z-40 hidden lg:inline-flex`}>
        <MessageCircle aria-hidden size={ICON_SIZE.button} />
        Chat with us
      </button>
      {hasOpened && <ChatPanel isOpen={isOpen} onClose={handleClose} />}
    </>
  );
}
