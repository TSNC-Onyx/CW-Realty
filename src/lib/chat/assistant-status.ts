// What website visitors get from the chat right now, in the owner's words (bug 10,
// docs/cwr-chatbot-round-3-plan.md, D5). The checks run in the same order as a visitor's
// question in send-chat-message.ts: the switch, the published policy, its public sections,
// then the Anthropic key.

export type AssistantState = "on" | "off" | "not_published" | "no_public_sections" | "not_connected";

export type AssistantStatus = { state: AssistantState; text: string };

export type AssistantStatusInput = {
  isSwitchOn: boolean;
  /** The published version's number, or null when nothing is published. */
  liveVersion: number | null;
  hasPublicSections: boolean;
  isConfigured: boolean;
};

const OFFERED_PERSON = "every visitor is offered a person";

function getOffStatus(liveVersion: number | null): AssistantStatus {
  const detail = liveVersion === null ? "Nothing is published yet." : `Version ${liveVersion} is published but not in use.`;
  return { state: "off", text: `Off: ${OFFERED_PERSON}. ${detail}` };
}

export function getAssistantStatus({ isSwitchOn, liveVersion, hasPublicSections, isConfigured }: AssistantStatusInput): AssistantStatus {
  if (!isSwitchOn) return getOffStatus(liveVersion);
  if (liveVersion === null) return { state: "not_published", text: `Not answering yet: nothing is published, so ${OFFERED_PERSON}.` };
  if (!hasPublicSections) return { state: "no_public_sections", text: `Not answering: version ${liveVersion} has no public sections, so ${OFFERED_PERSON}.` };
  if (!isConfigured) return { state: "not_connected", text: `Not connected: the AI key is missing, so ${OFFERED_PERSON}.` };
  return { state: "on", text: `On: visitors get answers from version ${liveVersion}.` };
}
