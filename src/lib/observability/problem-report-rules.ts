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
]);
const VISITOR_BROWSER_CODES: readonly BrowserProblemCode[] = [
  "script_error",
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
