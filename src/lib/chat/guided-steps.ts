import "server-only";

import { z } from "zod";

import { fetchChatTenantId, fetchOpenChatSession, fetchPublishedPolicy, isOverHourlyTopicChatLimit, recordGuidedExchange, startChatSession, type ChatSession, type GuidedExchange } from "@/lib/chat/chat-log";
import { getEmergencyReply } from "@/lib/chat/emergency";
import { getGuidedNode, getQuickAnswerLeaves, getQuickAnswerTitle, isGuidedLeaf, type GuidedNode } from "@/lib/chat/guided-tree";
import { getMatchingSection, getPublicSectionText, getPublicSections } from "@/lib/chat/policy-sections";
import { isOverGuidedLimit } from "@/lib/security/rate-limit";
import type { Visitor } from "@/lib/security/visitor";

// Chat topic buttons on the server (docs/cwr-chat-guided-options-plan.md §3, §6). Answers come
// only from the published policy's public "Quick answer: …" sections (the emergency button uses
// the fixed emergency reply), so the browser can never put words in the assistant's mouth.
// Taps never reach the AI and cost nothing, so they skip the Quick Check; they are limited per
// visitor, per chat, and by their own site-wide hourly cap, never the AI's.

// Longer than a short quick answer ever needs; a longer section is left out rather than cut.
const MAX_QUICK_ANSWER_LENGTH = 600;
const MAX_GUIDED_STEPS_PER_CHAT = 40;

export type GuidedAnswer = { text: string; section: string };

/** Answers by leaf id; a leaf whose section is missing, private, empty, or too long has none. */
export type GuidedAnswers = Record<string, GuidedAnswer>;

/** emergencySection: the policy section the emergency reply cites, or empty when the policy has none. */
export type GuidedMenuResult = { status: "ready"; answers: GuidedAnswers; emergencySection: string } | { status: "unavailable" };

/** recorded: saved in this chat (its id, which may be new) · skipped: not saved, by design (limits, a changed policy). */
export type GuidedStepResult = { status: "recorded"; sessionId: string } | { status: "skipped" };

export const guidedStepSchema = z.object({
  sessionId: z.uuid().nullable(),
  nodeId: z.string().min(1).max(40),
});

export type GuidedStepInput = z.input<typeof guidedStepSchema>;

function getQuickAnswer({ policyBody, leaf }: { policyBody: string; leaf: GuidedNode }): GuidedAnswer | null {
  const title = getQuickAnswerTitle(leaf);
  const text = getPublicSectionText(policyBody, title);
  if (!text || text.length > MAX_QUICK_ANSWER_LENGTH) return null;
  return { text, section: getMatchingSection(getPublicSections(policyBody), title) ?? title };
}

export function getGuidedAnswers(policyBody: string): GuidedAnswers {
  return Object.fromEntries(getQuickAnswerLeaves().flatMap((leaf) => {
    const answer = getQuickAnswer({ policyBody, leaf });
    return answer ? [[leaf.id, answer] as const] : [];
  }));
}

/** The answer a leaf shows today, or null when it has none. The emergency answer never depends on the policy. */
export function getGuidedAnswer({ policyBody, leaf }: { policyBody: string | null; leaf: GuidedNode }): GuidedAnswer | null {
  if (leaf.isEmergency) {
    const reply = getEmergencyReply(policyBody === null ? [] : getPublicSections(policyBody));
    return { text: reply.text, section: reply.citedSections[0] ?? "" };
  }
  return policyBody === null ? null : getQuickAnswer({ policyBody, leaf });
}

export async function fetchGuidedMenu(): Promise<GuidedMenuResult> {
  const policy = await fetchPublishedPolicy(await fetchChatTenantId());
  if (!policy) return { status: "unavailable" };
  const emergencySection = getEmergencyReply(getPublicSections(policy.body)).citedSections[0] ?? "";
  return { status: "ready", answers: getGuidedAnswers(policy.body), emergencySection };
}

async function fetchStepSession({ sessionId, tenantId, policyId }: { sessionId: string | null; tenantId: string; policyId: string | null }): Promise<ChatSession | null> {
  const openSession = sessionId === null ? null : await fetchOpenChatSession(sessionId);
  if (openSession) return openSession;
  if (await isOverHourlyTopicChatLimit(tenantId)) return null;
  return startChatSession({ tenantId, policyId, isTopicStart: true });
}

/** Saves one tapped topic and its answer in the visitor's chat, starting one when needed. Throws on database failure. */
export async function recordGuidedStep({ input, visitor }: { input: GuidedStepInput; visitor: Visitor }): Promise<GuidedStepResult> {
  const parsed = guidedStepSchema.safeParse(input);
  const leaf = parsed.success ? getGuidedNode(parsed.data.nodeId) : null;
  if (!parsed.success || !leaf || !isGuidedLeaf(leaf)) return { status: "skipped" };
  if (await isOverGuidedLimit(visitor.ip)) return { status: "skipped" };
  const tenantId = await fetchChatTenantId();
  const policy = await fetchPublishedPolicy(tenantId);
  const answer = getGuidedAnswer({ policyBody: policy?.body ?? null, leaf });
  if (!answer) return { status: "skipped" };
  const session = await fetchStepSession({ sessionId: parsed.data.sessionId, tenantId, policyId: policy?.id ?? null });
  if (!session || session.guidedStepCount >= MAX_GUIDED_STEPS_PER_CHAT) return { status: "skipped" };
  const exchange: GuidedExchange = { label: leaf.label, ...answer };
  await recordGuidedExchange({ session, exchange });
  return { status: "recorded", sessionId: session.id };
}
