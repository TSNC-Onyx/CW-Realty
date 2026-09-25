"use client";

import { useEffect, useState } from "react";

import { sendChatMessageAction } from "@/lib/chat/chat-actions";
import type { AssistantReply } from "@/lib/chat/assistant-reply";
import { getRedactedText } from "@/lib/chat/restricted-data";

// The widget's side of a chat: what it shows and the session id, kept in this tab's
// sessionStorage so a page load does not lose the conversation. The history the assistant
// reads is the server's own log, never this copy (Phase 5 plan, decision 5).

const STORAGE_KEY = "cwr-chat";
const EXPIRED_NOTICE = "That chat timed out. Send your question again to start a new one.";

export type ChatEntry = { id: string; role: "visitor" | "assistant"; text: string; citedSections: string[] };

type StoredChat = { sessionId: string | null; entries: ChatEntry[] };

const EMPTY_CHAT: StoredChat = { sessionId: null, entries: [] };

function isStoredChat(value: unknown): value is StoredChat {
  return typeof value === "object" && value !== null && Array.isArray((value as StoredChat).entries);
}

// Storage can be blocked (private windows, strict settings); the chat then lasts one page view.
function readStoredChat(): StoredChat {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null");
    return isStoredChat(parsed) ? parsed : EMPTY_CHAT;
  } catch {
    return EMPTY_CHAT;
  }
}

function writeStoredChat(chat: StoredChat): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chat));
  } catch {
    // Not saved: the conversation still works for this page view.
  }
}

function getEntries({ question, reply }: { question: string; reply: AssistantReply }): ChatEntry[] {
  return [
    { id: crypto.randomUUID(), role: "visitor", text: question, citedSections: [] },
    { id: crypto.randomUUID(), role: "assistant", text: reply.text, citedSections: reply.citedSections },
  ];
}

export function useChatConversation() {
  const [chat, setChat] = useState<StoredChat>(readStoredChat);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // A new key re-runs the bot check: its tokens work once.
  const [botCheckKey, setBotCheckKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    writeStoredChat(chat);
  }, [chat]);

  /** Resolves true when the question was answered, so the composer can clear its text. */
  const submitQuestion = async ({ question, turnstileToken }: { question: string; turnstileToken: string }): Promise<boolean> => {
    setPendingQuestion(question);
    setNotice(null);
    const result = await sendChatMessageAction({ sessionId: chat.sessionId, message: question, turnstileToken });
    setPendingQuestion(null);
    if (chat.sessionId === null) setBotCheckKey(crypto.randomUUID());
    if (result.status === "replied") setChat((current) => ({ sessionId: result.sessionId, entries: [...current.entries, ...getEntries({ question: result.question, reply: result.reply })] }));
    if (result.status === "expired") setChat((current) => ({ ...current, sessionId: null }));
    if (result.status !== "replied") setNotice(result.status === "expired" ? EXPIRED_NOTICE : result.message);
    return result.status === "replied";
  };

  const latestQuestion = getRedactedText(pendingQuestion ?? chat.entries.findLast((entry) => entry.role === "visitor")?.text ?? "");

  return { sessionId: chat.sessionId, entries: chat.entries, pendingQuestion, notice, botCheckKey, latestQuestion, submitQuestion, dismissNotice: () => setNotice(null) };
}
