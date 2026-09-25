"use client";

import type { MouseEvent, ReactNode } from "react";

import { openChat } from "@/components/chat/chat-events";
import { CONTACT_PAGE_PATH } from "@/lib/site/contact-links";

// A "Chat" link that opens the chat widget; without JavaScript it still reaches Contact.
export function ChatLink({ className, children }: { className: string; children: ReactNode }) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    openChat();
  };
  return (
    <a href={CONTACT_PAGE_PATH} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
