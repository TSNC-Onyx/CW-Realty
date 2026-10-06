// Fair Housing guard for the warm lead hand-off (docs/cwr-chatbot-round-3-plan.md, bug 15). A
// question that ties who lives somewhere to a place must never get the cheerful "a broker would
// love to help" line, whatever the model decided; it gets the plain "a person will help" line.
// It needs two signals so ordinary leads ("a young couple", "my family home", "the Greensboro
// area") are never caught: a protected-class or composition word, plus where-to-live wording.

// Protected characteristics and area-composition words (Fair Housing Act). Words common in
// ordinary leads (area, family, young, old, single, married) are deliberately left out.
const PROTECTED_TERMS = [
  "race", "racial", "ethnic", "ethnicity", "white", "black", "hispanic", "latino", "latina", "latinx", "asian", "african american",
  "immigrant", "immigrants", "christian", "christians", "muslim", "muslims", "jewish", "jews", "church", "churches", "mosque", "mosques", "synagogue", "religion", "religious",
  "disabled", "disability", "disabilities", "wheelchair", "wheelchairs",
  "kids", "children", "family-friendly", "elderly", "retirees", "gay", "lesbian", "lgbt", "lgbtq",
  "diverse", "diversity", "demographics", "crime", "safe", "safety", "school", "schools",
];

// Wording that asks where to live by who lives there: enough with a protected term in any message.
const STRONG_CUES = ["people like", "mostly", "fewest", "most", "community like", "where should", "where to live", "live near"];

// Plain place words: they count only next to a protected term in the same message.
const PLACE_WORDS = ["neighborhood", "neighborhoods", "neighbourhood", "neighbourhoods", "area", "areas", "part of town", "parts of town"];

function getWordPattern(terms: string[]): RegExp {
  const alternatives = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"));
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, "iu");
}

const PROTECTED_PATTERN = getWordPattern(PROTECTED_TERMS);
const STRONG_CUE_PATTERN = getWordPattern(STRONG_CUES);
const PLACE_PATTERN = getWordPattern(PLACE_WORDS);

/** Folds look-alike characters and curly apostrophes, so spelling tricks don't slip past. */
export function getNormalizedText(text: string): string {
  return text.normalize("NFKC").replace(/[\u2018\u2019\u02BC]/g, "'").toLowerCase();
}

/**
 * visitorMessages: the visitor's messages in the chat window, oldest first; the last is the
 * question being answered. True when (i) the latest message has a strong cue and any message
 * has a protected term, or (ii) the latest message has both a protected term and a place word.
 */
export function isSteeringRequest(visitorMessages: string[]): boolean {
  const messages = visitorMessages.map(getNormalizedText);
  const latest = messages.at(-1) ?? "";
  const hasProtectedTerm = messages.some((message) => PROTECTED_PATTERN.test(message));
  const isStrongCueAsk = STRONG_CUE_PATTERN.test(latest) && hasProtectedTerm;
  const isPlaceAsk = PROTECTED_PATTERN.test(latest) && PLACE_PATTERN.test(latest);
  return isStrongCueAsk || isPlaceAsk;
}
