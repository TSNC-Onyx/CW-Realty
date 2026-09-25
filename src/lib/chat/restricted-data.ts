// Financial and ID numbers never reach the model or the chat log (Features §2 "never
// financial or ID numbers"). Deliberately broad: a false alarm only asks the visitor to
// leave the number out, while a miss would store it.

// 123-45-6789, 123 45 6789, or 123456789 (one separator style throughout).
const SSN_PATTERN = /\b\d{3}([- ]?)\d{2}\1\d{4}\b/g;
// 12 to 19 digits, optionally grouped by spaces or dashes: card, bank, and ID numbers.
// US phone numbers (10 or 11 digits) stay below this length.
const LONG_NUMBER_PATTERN = /\b\d(?:[ -]?\d){11,18}\b/g;
const RESTRICTED_PATTERNS = [SSN_PATTERN, LONG_NUMBER_PATTERN];

export const REMOVED_NUMBER_TEXT = "[number removed]";

export function hasRestrictedNumber(text: string): boolean {
  return RESTRICTED_PATTERNS.some((pattern) => new RegExp(pattern.source).test(text));
}

export function getRedactedText(text: string): string {
  return RESTRICTED_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, REMOVED_NUMBER_TEXT), text);
}
