import { getNormalizedText } from "@/lib/chat/steering-terms";

// Bug 17 (docs/cwr-chatbot-round-3-plan.md): AI-written small talk must carry no facts and no
// slang. Facts belong in cited answers, so a small-talk reply that repeats the policy's wording
// or names someone or something from it is replaced by an approved line (OWASP LLM09).

// A run this long, shared word for word with the policy, is a copied fact, not small talk.
const OVERLAP_WORDS = 6;

const SLANG_PATTERN = /(?<![\p{L}'])(?:folks|y'all|ya'll|gonna|wanna|ain't|kinda|sorta|howdy)(?![\p{L}'])/iu;

// Names the approved small-talk replies use (the style examples and fallback lines).
const ALLOWED_PHRASES = ["Charlie Ward Realty", "North Carolina", "High Point", "Winston-Salem"];
const ALLOWED_NAMES = new Set(["I", "AI", "CWR", "Assistant", "Claude", "Anthropic", "Talk", "Person", "Triad", "Greensboro", "Durham"]);

const WORD_PATTERN = /[\p{L}\p{N}]+/gu;
// A capitalized word, with what comes right before it (to tell sentence starts apart).
const CAPITALIZED_WORD_PATTERN = /(^|[.!?]\s*["“'‘(]?|["“‘(]|\s)(\p{Lu}[\p{L}\p{N}-]*)/gu;
const SENTENCE_START = /^$|[.!?]\s*["“'‘(]?$|["“‘(]$/u;

function getWords(text: string): string[] {
  return getNormalizedText(text).match(WORD_PATTERN) ?? [];
}

function getWordRuns(words: string[]): Set<string> {
  const runs = new Set<string>();
  for (let index = 0; index + OVERLAP_WORDS <= words.length; index += 1) runs.add(words.slice(index, index + OVERLAP_WORDS).join(" "));
  return runs;
}

/** True when the reply repeats six or more words in a row from the policy. */
export function hasPolicyOverlap({ text, publicPolicy }: { text: string; publicPolicy: string }): boolean {
  const policyRuns = getWordRuns(getWords(publicPolicy));
  return [...getWordRuns(getWords(text))].some((run) => policyRuns.has(run));
}

export function hasSlang(text: string): boolean {
  return SLANG_PATTERN.test(getNormalizedText(text));
}

function getTextWithoutAllowedPhrases(text: string): string {
  return ALLOWED_PHRASES.reduce((remaining, phrase) => remaining.replaceAll(phrase, " "), text.normalize("NFKC"));
}

/** Capitalized words that aren't the first word of a sentence (or right after an opening quote). */
function getMidSentenceNames(text: string): string[] {
  return [...getTextWithoutAllowedPhrases(text).matchAll(CAPITALIZED_WORD_PATTERN)].flatMap((match) => (SENTENCE_START.test(match[1] ?? "") ? [] : [match[2] ?? ""]));
}

/** True when the reply names someone or something from the policy that small talk has no reason to name. */
export function hasPolicyName({ text, publicPolicy }: { text: string; publicPolicy: string }): boolean {
  const policyWords = new Set(publicPolicy.normalize("NFKC").match(WORD_PATTERN) ?? []);
  return getMidSentenceNames(text).some((name) => !ALLOWED_NAMES.has(name) && policyWords.has(name));
}
