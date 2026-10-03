import { z } from "zod";

import { INSTRUCTIONS_MARKER } from "@/lib/chat/assistant-prompt";
import { getMatchingSection } from "@/lib/chat/policy-sections";

// Server-side checks on what the model returns (Features §2): an answer survives only if it
// cites real policy sections and never contains the assistant's own instructions. Anything
// else becomes a hand-off to a person with fixed, pre-approved wording. Quoting the policy is
// allowed: it only holds public site content, and private notes never reach the model
// (owner decision 2026-10-02; docs/cwr-chat-policy-test-batches-plan.md, Part B).

const MAX_REPLY_LENGTH = 1500;

export const HANDOFF_TEXT = {
  outsidePolicy: "I can't answer that from our policy, but a person on our team can. Tap “Talk to a person” and leave your details.",
  restrictedNumber: "Please don't share Social Security, bank, card, or ID numbers here. I removed it. For help, tap “Talk to a person”.",
  unavailable: "The assistant can't answer right now, but a person on our team can. Tap “Talk to a person” and leave your details.",
} as const;

export type ChatOutcome = "answer" | "handoff";

/** Why an answer the model gave became a hand-off: model_handoff is the model's own choice; the rest are server checks. */
export type HandoffReason = "model_handoff" | "empty_or_long" | "bad_citation" | "leaked_marker";

export type AssistantReply = { outcome: ChatOutcome; text: string; citedSections: string[]; handoffReason?: HandoffReason };

export const modelReplySchema = z.object({
  outcome: z.enum(["answer", "handoff"]),
  reply: z.string(),
  citedSections: z.array(z.string()),
});

export type ModelReply = z.infer<typeof modelReplySchema>;

function getCitedSections(sections: string[], citedTitles: string[]): string[] | null {
  const matches = citedTitles.map((title) => getMatchingSection(sections, title));
  if (matches.length === 0 || matches.some((match) => match === null)) return null;
  return [...new Set(matches as string[])];
}

export function getHandoffReply(text: string): AssistantReply {
  return { outcome: "handoff", text, citedSections: [] };
}

function getRejectedReason({ modelReply, text, citedSections }: { modelReply: ModelReply; text: string; citedSections: string[] | null }): HandoffReason | null {
  if (modelReply.outcome === "handoff") return "model_handoff";
  if (text.length === 0 || text.length > MAX_REPLY_LENGTH) return "empty_or_long";
  if (citedSections === null) return "bad_citation";
  if (text.toUpperCase().includes(INSTRUCTIONS_MARKER)) return "leaked_marker";
  return null;
}

/** sections: the public sections the model was given (private ones can never be cited). */
export function getCheckedReply({ modelReply, sections }: { modelReply: ModelReply; sections: string[] }): AssistantReply {
  const text = modelReply.reply.trim();
  const citedSections = getCitedSections(sections, modelReply.citedSections);
  const rejectedReason = getRejectedReason({ modelReply, text, citedSections });
  if (rejectedReason !== null || citedSections === null) return { ...getHandoffReply(HANDOFF_TEXT.outsidePolicy), handoffReason: rejectedReason ?? "bad_citation" };
  return { outcome: "answer", text, citedSections };
}
