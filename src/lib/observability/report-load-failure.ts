import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";

import { isFirstInThisCopy } from "@/lib/observability/once-per-copy";
import { reportProblem } from "@/lib/observability/report-problem";
import { getErrorName } from "@/lib/observability/report-visitor-problem";
import { REQUEST_ID_HEADER } from "@/lib/observability/request-id";

// A part of a page that could not load (the page still shows, with that part missing) is
// recorded as a website-visitor warning (docs/visitor-audit-fixes-plan.md step 3.1).
// At most once per part per UTC hour in each running copy, so an outage cannot flood the
// Problems page, and a later outage in the same copy is still reported. The write runs after
// the page is sent, so a slow or failing database never slows the page.

/** "YYYY-MM-DDTHH": an ISO timestamp cut after the hour. */
const HOUR_STAMP_LENGTH = 13;

/** The page part that failed; stored as the problem's detail. */
export type LoadFailureSite =
  | "site_settings"
  | "page_listing"
  | "tracking_settings"
  | "home_team"
  | "about_owner"
  | "homework"
  | "connections"
  | "broker_profile"
  | "sitemap";

type LoadFailureReport = { siteKey: LoadFailureSite; code: string; requestId: string | null; pagePath: string | null };

/**
 * Logs the failure and schedules one problem report for it. Never throws; callers do not await it.
 * pagePath: the page's own path, or null for loaders shared by several pages.
 */
export async function reportLoadFailure(siteKey: LoadFailureSite, error: unknown, pagePath: string | null): Promise<void> {
  const code = getErrorName(error);
  console.error(JSON.stringify({ message: "Part of a page could not load", siteKey, error: code }));
  if (!isFirstInThisCopy(`${siteKey}:${getHourStamp(new Date())}`)) return;
  const requestId = await fetchRequestId();
  scheduleReport({ siteKey, code, requestId, pagePath });
}

function getHourStamp(now: Date): string {
  return now.toISOString().slice(0, HOUR_STAMP_LENGTH);
}

// Read before scheduling: request headers cannot be read inside after() (Next.js `after` docs).
async function fetchRequestId(): Promise<string | null> {
  try {
    return (await headers()).get(REQUEST_ID_HEADER);
  } catch {
    // Outside a request (for example a build step) there is no request ID to keep.
    return null;
  }
}

function scheduleReport({ siteKey, code, requestId, pagePath }: LoadFailureReport): void {
  try {
    after(() =>
      reportProblem({
        action: "site.page_load",
        stage: "load",
        severity: "warning",
        origin: "server_visitor",
        actorId: null,
        actorRole: null,
        code,
        detail: siteKey,
        requestId,
        pagePath,
      }),
    );
  } catch {
    // Outside a request after() is unavailable; the log line above is then the only record.
  }
}
