import { z } from "zod";

import { INSTRUCTIONS_MARKER } from "@/lib/chat/assistant-prompt";
import { getMatchingSection } from "@/lib/chat/policy-sections";

// Server-side checks on what the model returns (Features §2): an answer survives only if it
// cites real policy sections and leaks neither the instructions nor long runs of the policy.
// Anything else becomes a hand-off to a person with fixed, pre-approved wording.

const MAX_REPLY_LENGTH = 1500;
// A reply sharing this many words in a row with the policy (ignoring case, punctuation, and
// formatting) is copying it rather than answering in its own words.
const COPY_RUN_WORDS = 20;

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

function getWords(text: string): string[] {
  return text.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter((word) => word !== "");
}

function getWordRuns(words: string[]): string[] {
  return Array.from({ length: Math.max(words.length - COPY_RUN_WORDS + 1, 0) }, (_unused, start) => words.slice(start, start + COPY_RUN_WORDS).join(" "));
}

// Only policy positions whose first word also starts a reply run are compared, so a long
// policy costs a word scan, not a copy of every run in it.
function isCopyingPolicy(reply: string, policyBody: string): boolean {
  const replyRuns = new Set(getWordRuns(getWords(reply)));
  if (replyRuns.size === 0) return false;
  const firstWords = new Set([...replyRuns].map((run) => run.split(" ", 1)[0]));
  const policyWords = getWords(policyBody);
  return policyWords.some((word, start) => firstWords.has(word) && replyRuns.has(policyWords.slice(start, start + COPY_RUN_WORDS).join(" ")));
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
