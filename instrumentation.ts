import type { Instrumentation } from "next";

// Records pages and routes that crash while rendering on the server, with the digest the
// error screen later reports, so both share one reference (docs/cwr-error-tracking-plan.md).
// Public pages are recorded as website-visitor problems, without the error's message
// (docs/error-logging-a-grade-plan.md, Phase B).

const ADMIN_PATH_PREFIX = "/admin";
const PROBLEM_REPORT_PATH = "/admin/problems/report";

function getHeader(headers: NodeJS.Dict<string | string[]>, name: string): string | null {
  const value = headers[name];
  return typeof value === "string" ? value : null;
}

export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  // The browser report endpoint never reports its own failures (docs/cwr-error-tracking-plan.md).
  if (request.path.startsWith(PROBLEM_REPORT_PATH)) return;
  const { reportProblem } = await import("@/lib/observability/report-problem");
  const { getStackFrames } = await import("@/lib/observability/scrub");
  const { getCrashCause, getVisitorCrashCause } = await import("@/lib/observability/crash-cause");
  const crash = error instanceof Error ? error : new Error(String(error));
  const crashFacts = { crash, stackFrames: getStackFrames(crash.stack) };
  const isAdminPage = request.path.startsWith(ADMIN_PATH_PREFIX);
  await reportProblem({
    ...(isAdminPage ? { action: "portal.page_crash", ...getCrashCause(crashFacts) } : { action: "site.page_crash", origin: "server_visitor", actorId: null, actorRole: null, ...getVisitorCrashCause(crashFacts) }),
    digest: (error as { digest?: string }).digest ?? null,
    requestId: getHeader(request.headers, "x-request-id"),
    pagePath: request.path,
  });
};
