import { getProblemArea, type ProblemAction } from "@/lib/observability/problem-catalog";
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
const LOAD_ACTION_SUFFIX = ".load";
const SEVERITY_ORDER: ProblemSeverity[] = ["info", "warning", "error", "critical"];

export function isBrowserReportable(action: ProblemAction): boolean {
  return !SERVER_ONLY_AREAS.has(getProblemArea(action)) && !SERVER_ONLY_ACTIONS.has(action) && !action.endsWith(LOAD_ACTION_SUFFIX);
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
