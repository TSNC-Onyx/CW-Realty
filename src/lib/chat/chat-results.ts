import type { AssistantReply } from "@/lib/chat/assistant-reply";

// What the chat server action sends back to the widget.
// replied: an answer or a hand-off offer, with the question as saved (ID numbers removed) ·
// expired: start a new chat · error: show the message.

export type SendChatResult =
  | { status: "replied"; sessionId: string | null; question: string; reply: AssistantReply }
  | { status: "expired" }
  | { status: "error"; message: string };
