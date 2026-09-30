// Removes personal data and secrets from problem text before it is logged or stored
// (the database applies the same rules again). Keeps error codes and our own wording.

const SCRUB_RULES: { pattern: RegExp; replacement: string }[] = [
  { pattern: /Key \([^)]*\)=\([^)]*\)/g, replacement: "Key (…)=(…)" },
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: "[email]" },
  { pattern: /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, replacement: "[token]" },
  { pattern: /bearer\s+[A-Za-z0-9._~+/-]+=*/gi, replacement: "[token]" },
  { pattern: /\+?\(?\d[\d\s().-]{5,}\d/g, replacement: "[number]" },
  { pattern: /\d{6,}/g, replacement: "[number]" },
];

const MAX_STACK_FRAMES = 5;
const OWN_CODE_MARKERS = ["/_next/", "webpack-internal", "/src/", "/app/"];

export function getScrubbedText(text: string | null | undefined, maxLength: number): string | null {
  if (!text) return null;
  const scrubbed = SCRUB_RULES.reduce((current, { pattern, replacement }) => current.replace(pattern, replacement), text);
  return scrubbed.slice(0, maxLength);
}

/** The first few stack lines from our own code, with query strings removed. */
export function getOwnStackFrames(stack: string | undefined): string {
  if (!stack) return "";
  return stack
    .split("\n")
    .filter((line) => OWN_CODE_MARKERS.some((marker) => line.includes(marker)))
    .slice(0, MAX_STACK_FRAMES)
    .map((line) => line.trim().replace(/\?[^\s:)]*/g, ""))
    .join("\n");
}

/** A URL path without its query string or fragment. */
export function getPathOnly(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, "https://example.invalid").pathname;
  } catch {
    return null;
  }
}
