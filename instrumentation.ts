import type { Instrumentation } from "next";

// Records admin pages and routes that crash while rendering on the server, with the digest
// the error screen later reports, so both share one reference (docs/cwr-error-tracking-plan.md).
// Public pages are outside that plan's scope and keep only the server log.

const ADMIN_PATH_PREFIX = "/admin";
const PROBLEM_REPORT_PATH = "/admin/problems/report";

function getHeader(headers: NodeJS.Dict<string | string[]>, name: string): string | null {
  const value = headers[name];
  return typeof value === "string" ? value : null;
}

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  // The browser report endpoint never reports its own failures (docs/cwr-error-tracking-plan.md).
  if (!request.path.startsWith(ADMIN_PATH_PREFIX) || request.path.startsWith(PROBLEM_REPORT_PATH)) return;
  const { reportProblem } = await import("@/lib/observability/report-problem");
  const { getOwnStackFrames } = await import("@/lib/observability/scrub");
  const { getCrashCause } = await import("@/lib/observability/crash-cause");
  const crash = error instanceof Error ? error : new Error(String(error));
  const cause = getCrashCause({ crash, stackFrames: getOwnStackFrames(crash.stack) });
  await reportProblem({
    action: "portal.page_crash",
    ...cause,
    digest: (error as { digest?: string }).digest ?? null,
    requestId: getHeader(request.headers, "x-request-id"),
    pagePath: request.path,
  });
};
