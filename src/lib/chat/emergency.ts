import type { AssistantReply } from "@/lib/chat/assistant-reply";
import { EMERGENCY_TEXT } from "@/lib/chat/handoff-text";
import { getMatchingSection } from "@/lib/chat/policy-sections";

// Emergencies never wait on the AI (docs/cwr-chat-emergency-reply-plan.md). Deliberately broad:
// a false alarm only shows safety advice, while a miss could leave someone waiting a business day.

const EMERGENCY_SECTION = "Emergencies";

const EMERGENCY_PATTERNS = [
  /\bgas\b.{0,20}\b(?:leak|leaking|leaks|smell|smells|smelling|odou?r)\b/i,
  /\b(?:leak|leaking|smell|smells|smelling|odou?r)\b.{0,20}\bgas\b/i,
  // Not "fire pit" or "fire insurance", and not firing someone ("fire my agent").
  /(?<!\bto )\bfires?\b(?!\s*(?:pit|place|insurance|station|hydrant|code|rating|sale|wood|proof|department)|\s+(?:my|our|your|an?|the|him|her|them)\b)/i,
  /\b(?:on fire|burning smell|smell(?:s|ing)? (?:like )?(?:smoke|burning)|something(?:'s| is) burning)\b/i,
  /\bsmoke\b.{0,20}\b(?:coming|filling|pouring|everywhere|inside)\b/i,
  /\bfull of smoke\b/i,
  /\bcarbon monoxide\b|\bco (?:alarm|detector)\b/i,
  /\bflood(?:s|ed|ing)?\b(?!\s*(?:zone|plain|insurance|map|certificate|risk))/i,
  /\b(?:burst|broken|busted) (?:water )?pipe\b|\bpipe (?:burst|broke)\b|\bwater (?:is )?(?:pouring|gushing|everywhere)\b/i,
  /\bsparks?\b|\bsparking\b|\belectrical fire\b|\bexplo(?:sion|ded)\b/i,
  /\bemergenc(?:y|ies)\b(?!\s*(?:fund|savings|contact))|\b911\b/i,
];

export function isEmergencyMessage(text: string): boolean {
  const normalized = text.normalize("NFKC");
  return EMERGENCY_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** sections: the policy's public sections; the Emergencies section is cited when the policy has one. */
export function getEmergencyReply(sections: string[]): AssistantReply {
  const section = getMatchingSection(sections, EMERGENCY_SECTION);
  return { outcome: "answer", text: EMERGENCY_TEXT, citedSections: section ? [section] : [] };
}
