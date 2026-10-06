import { HANDOFF_TEXT, getCheckedReply, getHandoffReply, getUnrepeatedReply, type AssistantReply, type ModelReply } from "@/lib/chat/assistant-reply";
import { getSystemPrompt } from "@/lib/chat/assistant-prompt";
import { getEmergencyReply, isEmergencyMessage } from "@/lib/chat/emergency";
import { NEEDS_PERSON_TEXTS } from "@/lib/chat/handoff-text";
import { getPublicPolicy, getPublicSections } from "@/lib/chat/policy-sections";
import { hasRestrictedNumber } from "@/lib/chat/restricted-data";
import { isSteeringRequest } from "@/lib/chat/steering-terms";

// One answer from the policy (Features §2). Shared by the visitor chat, the owner's live
// test chat, and the policy test run, so what the owner tests is what visitors get.

export type ChatTurn = { role: "visitor" | "assistant"; body: string };

/** Returns null when the model declined or its reply could not be read. */
export type AnswerModel = (request: { systemPrompt: string; turns: ChatTurn[] }) => Promise<ModelReply | null>;

export type AnswerRequest = { policyBody: string; turns: ChatTurn[]; model: AnswerModel };

function getLatestQuestion(turns: ChatTurn[]): string {
  return turns.findLast((turn) => turn.role === "visitor")?.body ?? "";
}

function getPreviousReplyText(turns: ChatTurn[]): string | null {
  return turns.findLast((turn) => turn.role === "assistant")?.body ?? null;
}

/**
 * The reply as the visitor sees it in this chat (bug 16, docs/cwr-chatbot-round-3-plan.md):
 * after two "a person will help" lines in a row it says what the chat can do instead (the
 * repair lines take turns), and any other fixed line that would repeat itself is reworded.
 * Lead lines never turn into repair: a lead after a lead just takes the other lead line.
 */
export function getRepairedTurnReply({ reply, turns }: { reply: AssistantReply; turns: ChatTurn[] }): AssistantReply {
  const previousText = getPreviousReplyText(turns);
  const isSecondMiss = NEEDS_PERSON_TEXTS.has(reply.text) && previousText !== null && NEEDS_PERSON_TEXTS.has(previousText);
  if (!isSecondMiss) return getUnrepeatedReply({ reply, previousText });
  return { ...reply, text: previousText === HANDOFF_TEXT.repair ? HANDOFF_TEXT.repairAgain : HANDOFF_TEXT.repair };
}

/** Fair Housing guard (bug 15): a "lead" about who lives where gets the plain "a person will help" line. */
function getGuardedLead({ reply, turns }: { reply: AssistantReply; turns: ChatTurn[] }): AssistantReply {
  if (reply.handoffReason !== "lead") return reply;
  const visitorMessages = turns.filter((turn) => turn.role === "visitor").map((turn) => turn.body);
  if (!isSteeringRequest(visitorMessages)) return reply;
  return { ...getHandoffReply(HANDOFF_TEXT.needsPerson), handoffReason: "lead_downgraded" };
}

/** Throws whatever the model call throws; callers decide how to fail gracefully. */
export async function fetchAssistantReply({ policyBody, turns, model }: AnswerRequest): Promise<AssistantReply> {
  const question = getLatestQuestion(turns);
  if (hasRestrictedNumber(question)) return getHandoffReply(HANDOFF_TEXT.restrictedNumber);
  // Private sections are cut out here, so the model can't quote, summarize or reword them.
  const sections = getPublicSections(policyBody);
  if (isEmergencyMessage(question)) return getEmergencyReply(sections);
  if (sections.length === 0) return getHandoffReply(HANDOFF_TEXT.unavailable);
  const publicPolicy = getPublicPolicy(policyBody);
  const modelReply = await model({ systemPrompt: getSystemPrompt({ policyBody: publicPolicy, sections }), turns });
  if (modelReply === null) return getHandoffReply(HANDOFF_TEXT.needsPerson);
  return getGuardedLead({ reply: getCheckedReply({ modelReply, sections, publicPolicy }), turns });
}
