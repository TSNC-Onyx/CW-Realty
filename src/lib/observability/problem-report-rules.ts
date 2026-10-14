import { getProblemArea, type ProblemAction } from "@/lib/observability/problem-catalog";
import type { BrowserProblemCode } from "@/lib/observability/client-problem";
import type { ProblemSeverity } from "@/lib/observability/problem-types";

// Rules for problems reported by a browser (app/admin/problems/report/route.ts). Kept pure
// so they are unit-tested. A browser may only report what a browser can actually see go
// wrong; everything the server itself checks (page loads, sign-in sessions, background jobs)
// can only be recorded by the server, so no one can fake those into the owner's emails.

const SERVER_ONLY_AREAS = new Set(["jobs", "database", "unknown"]);
const SERVER_ONLY_ACTIONS = new Set<ProblemAction>([
  "auth.session_check",
  "auth.session_check_invalid",
  "auth.access_check",
  "auth.open_email_link",
  "auth.sign_out",
  "portal.load_frame",
  "portal.wrong_role",
  "portal.page_not_found",
  "closed_deals.export",
]);

// Website visitors are never signed in, so their browsers may report only these, with codes
// from a fixed list and no free text (docs/cwr-reliability-round-plan.md, Phase 1).
const VISITOR_BROWSER_ACTIONS = new Set<ProblemAction>([
  "site.bot_check_widget",
  "site.chat_widget",
  "site.listing_photo",
  "site.contact_form",
  "site.booking_form",
  "site.chat_handoff",
  "site.page_crash",
  "site.browser_error",
]);
// A crash screen's digest only links a report to the server's own record of the crash.
const DIGEST_ACTIONS = new Set<ProblemAction>(["site.page_crash"]);
// A stack frame from our own built code: "at name (https://…/_next/…:1:2)" or "name@https://…/_next/…:1:2".
const OWN_FRAME_PATTERN = /^\s*(?:at\s+)?[\w$.<>[\]\s]*?[(@]?\s*https?:\/\/[^\s()]+\/_next\/[^\s()]+:\d+:\d+\)?\s*$/;
const MAX_VISITOR_FRAMES = 10;
// The error's kind ("TypeError") from the report's first line; the message after it is dropped.
const ERROR_NAME_PATTERN = /^\s*([A-Z][A-Za-z]*(?:Error|Exception))\b/;
const VISITOR_BROWSER_CODES: readonly BrowserProblemCode[] = [
  "script_error",
  "chunk_load",
  "network",
  "timeout",
  "unsupported",
  "test_site_key",
  "missing_site_key",
  "action_failed",
  "stale_page",
  "image_failed",
  "outdated_page_loop",
];
const VISITOR_AREA = "site";
const LOAD_ACTION_SUFFIX = ".load";
const SEVERITY_ORDER: ProblemSeverity[] = ["info", "warning", "error", "critical"];

export function isBrowserReportable(action: ProblemAction): boolean {
  if (getProblemArea(action) === VISITOR_AREA) return isVisitorBrowserAction(action);
  return !SERVER_ONLY_AREAS.has(getProblemArea(action)) && !SERVER_ONLY_ACTIONS.has(action) && !action.endsWith(LOAD_ACTION_SUFFIX);
}

/** A problem a website visitor's browser may report, whoever is signed in. */
export function isVisitorBrowserAction(action: ProblemAction): boolean {
  return VISITOR_BROWSER_ACTIONS.has(action);
}

/** Codes outside the visitor list become "other", so a script can't invent kinds of problems. */
export function getVisitorBrowserCode(code: string): BrowserProblemCode {
  return VISITOR_BROWSER_CODES.find((visitorCode) => visitorCode === code) ?? "other";
}

/**
 * What a visitor's report may carry as detail: the error's kind and the lines that are code
 * locations in our own built code, without query strings. Error text, which could repeat what
 * was typed, is dropped.
 */
export function getVisitorStackFrames(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const lines = detail.split("\n");
  const errorName = ERROR_NAME_PATTERN.exec(lines[0] ?? "")?.[1];
  const frames = lines
    .filter((line) => OWN_FRAME_PATTERN.test(line))
    .slice(0, MAX_VISITOR_FRAMES)
    .map((line) => line.trim().replace(/\?[^\s:)]*/g, ""));
  if (frames.length === 0) return errorName;
  return [errorName, ...frames].filter(Boolean).join("\n");
}

/** A visitor's report keeps a digest only where it links to the server's own crash record. */
export function getVisitorDigest({ action, digest }: { action: ProblemAction; digest?: string }): string | undefined {
  return DIGEST_ACTIONS.has(action) ? digest : undefined;
}

/** Same-site check that never throws: a missing, "null", or malformed Origin is refused. */
export function isSameSiteOrigin({ origin, host }: { origin: string | null; host: string | null }): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function getCappedSeverity(severity: ProblemSeverity, maxSeverity: ProblemSeverity): ProblemSeverity {
  return SEVERITY_ORDER[Math.min(SEVERITY_ORDER.indexOf(severity), SEVERITY_ORDER.indexOf(maxSeverity))] ?? "warning";
}
