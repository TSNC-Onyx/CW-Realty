"use client";

import { useEffect, useState } from "react";

import { useChatTopics, type TopicEntry } from "@/components/chat/use-chat-topics";

import { sendChatMessageAction } from "@/lib/chat/chat-actions";
import type { AssistantReply } from "@/lib/chat/assistant-reply";
import type { SendChatResult } from "@/lib/chat/chat-results";
import type { ChatMessageInput } from "@/lib/chat/chat-schemas";
import { getRedactedText } from "@/lib/chat/restricted-data";
import { getCallFailure } from "@/lib/observability/call-server-action";
import { reportVisitorClientProblem } from "@/lib/observability/report-client-problem";
import { BOT_CHECK_MESSAGES } from "@/lib/security/bot-check-messages";
import { pushKeyEvent } from "@/lib/tracking/data-layer";

// The widget's side of a chat: what it shows and the session id, kept in this tab's
// sessionStorage so a page load does not lose the conversation. The history the assistant
// reads is the server's own log, never this copy (Phase 5 plan, decision 5).

const STORAGE_KEY = "cwr-chat";
const EXPIRED_NOTICE = "I'm sorry, that chat timed out. Just send your question again and we'll start fresh.";
const UNREACHABLE_NOTICE = "I'm sorry, I couldn't get your message through. Please try again, or tap “Talk to a person”.";

/** source "guided": a topic button or its answer; topicId: the topic an answer belongs to (its page link). */
export type ChatEntry = { id: string; role: "visitor" | "assistant"; text: string; citedSections: string[]; source?: "guided"; topicId?: string };

/** topicId: where the visitor is in the topic buttons, so a page change keeps their place. */
type StoredChat = { sessionId: string | null; entries: ChatEntry[]; topicId?: string };

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

// The call itself can fail before reaching the server (a site update while the page was open,
// a dropped connection): the chat says so, is recorded, and never stays stuck on "replying".
export async function fetchChatResult(input: ChatMessageInput): Promise<SendChatResult> {
  try {
    return await sendChatMessageAction(input);
  } catch (error) {
    const failure = getCallFailure(error);
    void reportVisitorClientProblem({ action: "site.chat_widget", stage: "network", severity: failure.severity, code: failure.code === "other" ? "action_failed" : failure.code });
    if (failure.code === "stale_page") return { status: "error", message: BOT_CHECK_MESSAGES.outdatedRefreshButton, recovery: "refresh" };
    return { status: "error", message: UNREACHABLE_NOTICE };
  }
}

function isOutdatedPageResult(result: SendChatResult): boolean {
  return result.status === "error" && result.recovery === "refresh";
}

export function useChatConversation() {
  const [chat, setChat] = useState<StoredChat>(readStoredChat);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The page is out of date: the composer offers Refresh page instead of sending.
  const [isOutdated, setIsOutdated] = useState(false);
  // A new key re-runs the bot check: its tokens work once.
  const [botCheckKey, setBotCheckKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    writeStoredChat(chat);
  }, [chat]);

  const topics = useChatTopics({
    sessionId: chat.sessionId,
    topicId: chat.topicId,
    isBlocked: pendingQuestion !== null,
    onEntries: (entries: TopicEntry[]) => setChat((current) => ({ ...current, entries: [...current.entries, ...entries.map((entry) => ({ ...entry, id: crypto.randomUUID(), source: "guided" as const }))] })),
    onSessionId: (sessionId) => setChat((current) => ({ ...current, sessionId })),
    onTopicId: (topicId) => setChat((current) => ({ ...current, topicId })),
  });

  // A chat started by topic buttons still runs the Quick Check before its first typed question.
  const hasTypedQuestion = chat.entries.some((entry) => entry.role === "visitor" && entry.source !== "guided");

  /** Resolves true when the question was answered, so the composer can clear its text. */
  const submitQuestion = async ({ question, turnstileToken, botCheckKey }: { question: string; turnstileToken: string; botCheckKey: string }): Promise<boolean> => {
    setPendingQuestion(question);
    setNotice(null);
    // A tap still being saved may be starting this chat: wait for it, so both land in one chat.
    const sessionId = await topics.whenSaved();
    const result = await fetchChatResult({ sessionId, message: question, turnstileToken, botCheckKey });
    setPendingQuestion(null);
    setIsOutdated(isOutdatedPageResult(result));
    // A new key re-runs the Quick Check whenever this send was a chat's first typed question.
    if (chat.sessionId === null || !hasTypedQuestion) setBotCheckKey(crypto.randomUUID());
    if (result.status === "replied") setChat((current) => ({ ...current, sessionId: result.sessionId, entries: [...current.entries, ...getEntries({ question: result.question, reply: result.reply })] }));
    // Features §3 key event "chats": a question the assistant received (sent only after consent).
    if (result.status === "replied") pushKeyEvent({ name: "cwr_chat_question", eventId: crypto.randomUUID() });
    if (result.status === "expired") setChat((current) => ({ ...current, sessionId: null }));
    if (result.status !== "replied" && !isOutdatedPageResult(result)) setNotice(result.status === "expired" ? EXPIRED_NOTICE : result.message);
    return result.status === "replied";
  };

  const latestQuestion = getRedactedText(pendingQuestion ?? chat.entries.findLast((entry) => entry.role === "visitor")?.text ?? "");

  return { sessionId: chat.sessionId, entries: chat.entries, pendingQuestion, notice, isOutdated, botCheckKey, latestQuestion, hasTypedQuestion, topics, submitQuestion, dismissNotice: () => setNotice(null) };
}
