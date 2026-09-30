import type { Instrumentation } from "next";

// Records admin pages and routes that crash while rendering on the server, with the digest
// the error screen later reports, so both share one reference (docs/cwr-error-tracking-plan.md).
// Public pages are outside that plan's scope and keep only the server log.

const ADMIN_PATH_PREFIX = "/admin";
const PROBLEM_REPORT_PATH = "/admin/problems/report";
// The browser left before the page finished streaming (closed the tab, clicked elsewhere):
// noted, never treated as a crash that emails the owner.
const CLIENT_LEFT_PATTERN = /destination stream closed early|aborted|ECONNRESET/i;

function getHeader(headers: NodeJS.Dict<string | string[]>, name: string): string | null {
  const value = headers[name];
  return typeof value === "string" ? value : null;
}

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  // The browser report endpoint never reports its own failures (docs/cwr-error-tracking-plan.md).
  if (!request.path.startsWith(ADMIN_PATH_PREFIX) || request.path.startsWith(PROBLEM_REPORT_PATH)) return;
  const { reportProblem } = await import("@/lib/observability/report-problem");
  const { getOwnStackFrames } = await import("@/lib/observability/scrub");
  const crash = error instanceof Error ? error : new Error(String(error));
  const hasClientLeft = CLIENT_LEFT_PATTERN.test(crash.message) || crash.name === "AbortError";
  await reportProblem({
    action: "portal.page_crash",
    stage: hasClientLeft ? "network" : "unexpected",
    severity: hasClientLeft ? "info" : "error",
    code: hasClientLeft ? "client_left" : crash.name,
    detail: `${crash.message}\n${getOwnStackFrames(crash.stack)}`,
    digest: (error as { digest?: string }).digest ?? null,
    requestId: getHeader(request.headers, "x-request-id"),
    pagePath: request.path,
  });
};
