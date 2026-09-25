// Financial and ID numbers never reach the model or the chat log (Features §2 "never
// financial or ID numbers"). Deliberately broad: a false alarm only asks the visitor to
// leave the number out, while a miss would store it.

const SEPARATOR = "[ .-]{0,3}";
// 123-45-6789, 123.45.6789, 123 - 45 - 6789, or 123456789.
const SSN_PATTERN = new RegExp(`\\b\\d{3}${SEPARATOR}\\d{2}${SEPARATOR}\\d{4}\\b`, "g");
// 12 to 19 digits, however they are grouped: card, bank, and ID numbers.
// US phone numbers (10 or 11 digits) stay below this length.
const LONG_NUMBER_PATTERN = new RegExp(`\\b\\d(?:${SEPARATOR}\\d){11,18}\\b`, "g");
// Shorter numbers (6 to 17 digits) right after words that name an account or ID.
const LABELED_NUMBER_PATTERN = new RegExp(
  `(?<=\\b(?:account|acct|routing|bank|card|ssn|social security|social|license|licence|passport|id|tax id|ein|itin)\\b[^0-9]{0,30})\\d(?:${SEPARATOR}\\d){5,16}\\b`,
  "gi",
);
// Labeled numbers first: once a number is replaced, a later number could otherwise look
// "labeled" by an earlier word.
const RESTRICTED_PATTERNS = [LABELED_NUMBER_PATTERN, SSN_PATTERN, LONG_NUMBER_PATTERN];

export const REMOVED_NUMBER_TEXT = "[number removed]";

export function hasRestrictedNumber(text: string): boolean {
  return RESTRICTED_PATTERNS.some((pattern) => new RegExp(pattern.source, pattern.flags.replace("g", "")).test(text));
}

export function getRedactedText(text: string): string {
  return RESTRICTED_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, REMOVED_NUMBER_TEXT), text);
}
