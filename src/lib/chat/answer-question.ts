import { HANDOFF_TEXT, getCheckedReply, getHandoffReply, getUnrepeatedReply, type AssistantReply, type ModelReply } from "@/lib/chat/assistant-reply";
import { getSystemPrompt } from "@/lib/chat/assistant-prompt";
import { getPublicPolicy, getPublicSections } from "@/lib/chat/policy-sections";
import { hasRestrictedNumber } from "@/lib/chat/restricted-data";

// One answer from the policy (Features §2). Shared by the visitor chat, the owner's live
// test chat, and the policy test run, so what the owner tests is what visitors get.

export type ChatTurn = { role: "visitor" | "assistant"; body: string };

/** Returns null when the model declined or its reply could not be read. */
export type AnswerModel = (request: { systemPrompt: string; turns: ChatTurn[] }) => Promise<ModelReply | null>;

export type AnswerRequest = { policyBody: string; turns: ChatTurn[]; model: AnswerModel };

function getLatestQuestion(turns: ChatTurn[]): string {
  return turns.findLast((turn) => turn.role === "visitor")?.body ?? "";
}

/** A fixed line that would repeat the assistant's last reply in this chat is reworded. */
export function getUnrepeatedTurnReply({ reply, turns }: { reply: AssistantReply; turns: ChatTurn[] }): AssistantReply {
  const previousText = turns.findLast((turn) => turn.role === "assistant")?.body ?? null;
  return getUnrepeatedReply({ reply, previousText });
}

/** Throws whatever the model call throws; callers decide how to fail gracefully. */
export async function fetchAssistantReply({ policyBody, turns, model }: AnswerRequest): Promise<AssistantReply> {
  if (hasRestrictedNumber(getLatestQuestion(turns))) return getHandoffReply(HANDOFF_TEXT.restrictedNumber);
  // Private sections are cut out here, so the model can't quote, summarize or reword them.
  const sections = getPublicSections(policyBody);
  if (sections.length === 0) return getHandoffReply(HANDOFF_TEXT.unavailable);
  const modelReply = await model({ systemPrompt: getSystemPrompt({ policyBody: getPublicPolicy(policyBody), sections }), turns });
  if (modelReply === null) return getHandoffReply(HANDOFF_TEXT.needsPerson);
  return getCheckedReply({ modelReply, sections });
}
