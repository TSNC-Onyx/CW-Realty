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

// Ten lines are enough to see the path from our code to the failure (docs/error-logging-a-grade-plan.md, Phase C).
const MAX_STACK_FRAMES = 10;
// A stack line: some text, then a code location "file:line:column", with or without brackets
// (Chrome, Firefox, Safari, and the Workers runtime all end a frame this way).
const FRAME_PATTERN = /^(.*?)((?:[a-z][\w+.-]*:\/\/)?[^\s()]+:\d+:\d+)(\)?)\s*$/;
// A query string inside a code location ("file.js?token=…:1:2") can carry anything; it is dropped.
const QUERY_IN_LOCATION_PATTERN = /\?[^:]*(?=:\d+:\d+$)/;
// Frames from browser extensions and the runtime itself say nothing about our code.
const NOISE_MARKERS = ["chrome-extension://", "moz-extension://", "safari-extension://", "safari-web-extension://", "node:internal"];

export function getScrubbedText(text: string | null | undefined, maxLength: number): string | null {
  if (!text) return null;
  const scrubbed = SCRUB_RULES.reduce((current, { pattern, replacement }) => current.replace(pattern, replacement), text);
  return scrubbed.slice(0, maxLength);
}

function isCodeFrame(line: string): boolean {
  return FRAME_PATTERN.test(line) && !NOISE_MARKERS.some((marker) => line.includes(marker));
}

/** The first stack lines (not from extensions or the runtime), with query strings removed. */
export function getStackFrames(stack: string | undefined): string {
  if (!stack) return "";
  return stack
    .split("\n")
    .filter(isCodeFrame)
    .slice(0, MAX_STACK_FRAMES)
    .map((line) => line.trim().replace(/\?[^\s:)]*/g, ""))
    .join("\n");
}

function getScrubbedLine(line: string): string {
  const frame = FRAME_PATTERN.exec(line);
  if (!frame) return getScrubbedText(line, line.length) ?? "";
  const [, name = "", location = "", closing = ""] = frame;
  return `${getScrubbedText(name, name.length) ?? ""}${location.replace(QUERY_IN_LOCATION_PATTERN, "")}${closing}`;
}

/**
 * A problem's detail with personal data removed, except the "file:line:column" of each stack
 * line: scrubbing long numbers there would make the trace impossible to read back.
 */
export function getScrubbedDetail(text: string | null | undefined, maxLength: number): string | null {
  if (!text) return null;
  return text.split("\n").map(getScrubbedLine).join("\n").slice(0, maxLength);
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
