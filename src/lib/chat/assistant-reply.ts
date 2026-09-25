import { z } from "zod";

import { INSTRUCTIONS_MARKER } from "@/lib/chat/assistant-prompt";
import { getMatchingSection } from "@/lib/chat/policy-sections";

// Server-side checks on what the model returns (Features §2): an answer survives only if it
// cites real policy sections and leaks neither the instructions nor long runs of the policy.
// Anything else becomes a hand-off to a person with fixed, pre-approved wording.

const MAX_REPLY_LENGTH = 1500;
// A reply sharing this many consecutive characters with the policy is copying it.
const COPY_WINDOW_LENGTH = 150;
const COPY_WINDOW_STEP = 50;

export const HANDOFF_TEXT = {
  outsidePolicy: "I can't answer that from our policy, but a person on our team can. Tap “Talk to a person” and leave your details.",
  restrictedNumber: "Please don't share Social Security, bank, card, or ID numbers here. I removed it. For help, tap “Talk to a person”.",
  unavailable: "The assistant can't answer right now, but a person on our team can. Tap “Talk to a person” and leave your details.",
} as const;

export type ChatOutcome = "answer" | "handoff";

export type AssistantReply = { outcome: ChatOutcome; text: string; citedSections: string[] };

export const modelReplySchema = z.object({
  outcome: z.enum(["answer", "handoff"]),
  reply: z.string(),
  citedSections: z.array(z.string()),
});

export type ModelReply = z.infer<typeof modelReplySchema>;

function getCollapsedText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function isCopyingPolicy(reply: string, policyBody: string): boolean {
  const collapsedReply = getCollapsedText(reply);
  const collapsedPolicy = getCollapsedText(policyBody);
  for (let start = 0; start + COPY_WINDOW_LENGTH <= collapsedReply.length; start += COPY_WINDOW_STEP) {
    if (collapsedPolicy.includes(collapsedReply.slice(start, start + COPY_WINDOW_LENGTH))) return true;
  }
  return false;
}

function isLeaking(reply: string, policyBody: string): boolean {
  return reply.toUpperCase().includes(INSTRUCTIONS_MARKER) || isCopyingPolicy(reply, policyBody);
}

function getCitedSections(sections: string[], citedTitles: string[]): string[] | null {
  const matches = citedTitles.map((title) => getMatchingSection(sections, title));
  if (matches.length === 0 || matches.some((match) => match === null)) return null;
  return [...new Set(matches as string[])];
}

export function getHandoffReply(text: string): AssistantReply {
  return { outcome: "handoff", text, citedSections: [] };
}

export function getCheckedReply({ modelReply, sections, policyBody }: { modelReply: ModelReply; sections: string[]; policyBody: string }): AssistantReply {
  const text = modelReply.reply.trim();
  const citedSections = getCitedSections(sections, modelReply.citedSections);
  if (modelReply.outcome === "handoff") return getHandoffReply(HANDOFF_TEXT.outsidePolicy);
  if (text.length === 0 || text.length > MAX_REPLY_LENGTH) return getHandoffReply(HANDOFF_TEXT.outsidePolicy);
  if (citedSections === null || isLeaking(text, policyBody)) return getHandoffReply(HANDOFF_TEXT.outsidePolicy);
  return { outcome: "answer", text, citedSections };
}
