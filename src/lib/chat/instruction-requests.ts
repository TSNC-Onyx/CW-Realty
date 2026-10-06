import { getNormalizedText } from "@/lib/chat/steering-terms";

// Prompt-extraction guard (OWASP LLM07; docs/cwr-chat-quick-answers-and-tests-plan.md §G): a
// question about the assistant's own rules, prompt, or instructions never gets small talk in
// the AI's own words; it gets the approved "a person will help" line. Phrases are specific to
// the assistant ("your rules", "you were told"), so questions about the company's own rules
// ("what are your rental rules?") still reach the policy.

// Always about the assistant itself.
const SELF_PHRASES = [
  "system prompt", "your prompt", "your instructions", "your programming", "were you told", "you were told", "you've been told",
  "told to do", "were you programmed", "you were programmed", "previous instructions", "prior instructions", "ignore all", "ignore your", "repeat the text above",
  "your directives", "your configuration", "your setup", "how you were set up", "reveal your", "show me your prompt", "what were you instructed", "your hidden",
];

// About the assistant unless the question names a company topic ("your rules for pets").
const RULE_PHRASES = ["your rules", "your guidelines"];

const POLICY_TOPIC_WORDS = ["rent", "rental", "rentals", "lease", "leases", "pet", "pets", "tenant", "tenants", "listing", "listings", "showing", "showings", "plan", "plans", "fee", "fees"];

function getPhrasePattern(phrases: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}])(?:${phrases.map((phrase) => phrase.replace(/ /g, "\\s+")).join("|")})(?![\\p{L}])`, "iu");
}

const SELF_PATTERN = getPhrasePattern(SELF_PHRASES);
const RULE_PATTERN = getPhrasePattern(RULE_PHRASES);
const POLICY_TOPIC_PATTERN = getPhrasePattern(POLICY_TOPIC_WORDS);

export function isInstructionsRequest(question: string): boolean {
  const normalized = getNormalizedText(question);
  if (SELF_PATTERN.test(normalized)) return true;
  return RULE_PATTERN.test(normalized) && !POLICY_TOPIC_PATTERN.test(normalized);
}
