import { z } from "zod";

import { INSTRUCTIONS_MARKER } from "@/lib/chat/assistant-prompt";
import { hasPolicyName, hasPolicyOverlap, hasSlang } from "@/lib/chat/conversation-checks";
import { HANDOFF_TEXT, REPEAT_WORDING } from "@/lib/chat/handoff-text";
import { getMatchingSection } from "@/lib/chat/policy-sections";

// Server-side checks on what the model returns (Features §2): an answer survives only if it
// cites real policy sections and never contains the assistant's own instructions. Quoting the
// policy is allowed: it only holds public site content, and private notes never reach the model
// (owner decision 2026-10-02; docs/cwr-chat-policy-test-batches-plan.md, Part B).
// Hand-offs: the model may word its own short, kind reply only to small talk and off-topic
// messages ("conversation"); every other hand-off, and any reply that fails a check, uses the
// fixed, owner-approved wording (owner decision D1, docs/cwr-chatbot-alignment-plan.md).
// AI-written small talk may never carry a number, price, email, domain or link (Part 2 B1);
// when it fails a check, the visitor gets an approved small-talk line instead.
// Round 3 (docs/cwr-chatbot-round-3-plan.md): a sales lead gets a fixed, warm lead line (bug 15),
// and small talk may not repeat the policy's facts or names, or use slang (bug 17).

const MAX_REPLY_LENGTH = 1500;
const MAX_CONVERSATION_LENGTH = 400;

// Unicode digits, money, email and percent signs, links, and domains (after NFKC folding).
const UNSAFE_CONVERSATION_PATTERN = /[\p{Nd}$@%]|https?:|www\.|\b[a-z0-9-]+\.(?:com|net|org|us|io|co|biz|info|homes|realty|realestate|house|properties|ai|app)\b/iu;

export { HANDOFF_TEXT };

export type ChatOutcome = "answer" | "handoff";

/** Why a reply is a hand-off: model_handoff is the model's own choice; the rest are server checks. */
export type HandoffReason =
  | "model_handoff"
  | "empty_or_long"
  | "bad_citation"
  | "leaked_marker"
  | "unsafe_conversation"
  | "lead"
  | "lead_downgraded"
  | "policy_fact_in_conversation"
  | "slang_in_conversation";

/** handoffReason and rejectedText are server-only: callers strip them before anything reaches a browser. */
export type AssistantReply = { outcome: ChatOutcome; text: string; citedSections: string[]; handoffReason?: HandoffReason; rejectedText?: string };

export const modelReplySchema = z.object({
  outcome: z.enum(["answer", "handoff"]),
  /**
   * For hand-offs only: "conversation" (small talk, off-topic) keeps the model's own wording;
   * "lead" (someone wants to buy, sell, rent or have a home managed) and "needs_person" use fixed text.
   */
  handoffKind: z.enum(["conversation", "lead", "needs_person"]),
  reply: z.string(),
  citedSections: z.array(z.string()),
});

export type ModelReply = z.infer<typeof modelReplySchema>;

function getCitedSections(sections: string[], citedTitles: string[]): string[] | null {
  const matches = citedTitles.map((title) => getMatchingSection(sections, title));
  if (matches.length === 0 || matches.some((match) => match === null)) return null;
  return [...new Set(matches as string[])];
}

function getTextProblem({ text, maxLength }: { text: string; maxLength: number }): HandoffReason | null {
  if (text.length === 0 || text.length > maxLength) return "empty_or_long";
  if (text.toUpperCase().includes(INSTRUCTIONS_MARKER)) return "leaked_marker";
  return null;
}

/** publicPolicy: the policy text the model was given, so small talk can't repeat its facts. */
function getConversationProblem({ text, publicPolicy }: { text: string; publicPolicy: string }): HandoffReason | null {
  const textProblem = getTextProblem({ text, maxLength: MAX_CONVERSATION_LENGTH });
  if (textProblem) return textProblem;
  if (UNSAFE_CONVERSATION_PATTERN.test(text.normalize("NFKC"))) return "unsafe_conversation";
  if (hasSlang(text)) return "slang_in_conversation";
  if (hasPolicyOverlap({ text, publicPolicy }) || hasPolicyName({ text, publicPolicy })) return "policy_fact_in_conversation";
  return null;
}

export function getHandoffReply(text: string): AssistantReply {
  return { outcome: "handoff", text, citedSections: [] };
}

function getFixedHandoff(reason: HandoffReason): AssistantReply {
  return { ...getHandoffReply(HANDOFF_TEXT.needsPerson), handoffReason: reason };
}

function getCheckedAnswer({ text, citedTitles, sections }: { text: string; citedTitles: string[]; sections: string[] }): AssistantReply {
  const citedSections = getCitedSections(sections, citedTitles);
  const textProblem = getTextProblem({ text, maxLength: MAX_REPLY_LENGTH });
  if (textProblem) return getFixedHandoff(textProblem);
  if (citedSections === null) return getFixedHandoff("bad_citation");
  return { outcome: "answer", text, citedSections };
}

/** Citations on a hand-off are dropped: visitors see a source line only under answers. */
function getCheckedHandoff({ text, handoffKind, publicPolicy }: { text: string; handoffKind: ModelReply["handoffKind"]; publicPolicy: string }): AssistantReply {
  if (handoffKind === "needs_person") return getFixedHandoff("model_handoff");
  if (handoffKind === "lead") return { ...getHandoffReply(HANDOFF_TEXT.lead), handoffReason: "lead" };
  const conversationProblem = getConversationProblem({ text, publicPolicy });
  if (conversationProblem) return { ...getHandoffReply(HANDOFF_TEXT.conversation), handoffReason: conversationProblem, rejectedText: text };
  return { ...getHandoffReply(text), handoffReason: "model_handoff" };
}

/** sections and publicPolicy: what the model was given (private sections never reach it). */
export function getCheckedReply({ modelReply, sections, publicPolicy }: { modelReply: ModelReply; sections: string[]; publicPolicy: string }): AssistantReply {
  const text = modelReply.reply.trim();
  if (modelReply.outcome === "handoff") return getCheckedHandoff({ text, handoffKind: modelReply.handoffKind, publicPolicy });
  return getCheckedAnswer({ text, citedTitles: modelReply.citedSections, sections });
}

/** The reply without the text a check rejected, which only the server's problem log may see. */
export function getReplyWithoutRejectedText(reply: AssistantReply): AssistantReply {
  return { outcome: reply.outcome, text: reply.text, citedSections: reply.citedSections, ...(reply.handoffReason ? { handoffReason: reply.handoffReason } : {}) };
}

/** previousText: the assistant's last reply in this chat, if any. A fixed line that would repeat it is reworded. */
export function getUnrepeatedReply({ reply, previousText }: { reply: AssistantReply; previousText: string | null }): AssistantReply {
  const alternateText = REPEAT_WORDING[reply.text];
  if (!alternateText || reply.text !== previousText) return reply;
  return { ...reply, text: alternateText };
}
