import { ADMIN_PROBLEM_REPORT_PATH } from "@/lib/admin/paths";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import type { ProblemSeverity } from "@/lib/observability/problem-types";

// What a browser may report about a problem it saw (docs/cwr-error-tracking-plan.md). The
// server decides who reported it and caps how serious it can be; the code comes from a fixed
// list, so no browser can create unlimited kinds of problems.

export const PROBLEM_REPORT_PATH = ADMIN_PROBLEM_REPORT_PATH;

export const BROWSER_PROBLEM_CODES = [
  "http_4xx",
  "http_5xx",
  "network",
  "timeout",
  "aborted",
  "stale_page",
  "chunk_load",
  "worker_error",
  "decode_error",
  "file_rejected",
  "script_error",
  "unsupported",
  "test_site_key",
  "missing_site_key",
  "action_failed",
  "image_failed",
  "outdated_page_loop",
  "other",
] as const;

export type BrowserProblemCode = (typeof BROWSER_PROBLEM_CODES)[number];

export const BROWSER_PROBLEM_STAGES = ["browser", "network", "unexpected", "auth"] as const;

export type ClientProblem = {
  action: ProblemAction;
  stage: (typeof BROWSER_PROBLEM_STAGES)[number];
  severity: ProblemSeverity;
  code: BrowserProblemCode;
  shownMessage?: string;
  detail?: string;
  digest?: string;
};

export type ClientProblemReport = ClientProblem & { id: string; pagePath: string };

export function getHttpProblemCode(status: number): BrowserProblemCode {
  return status >= 500 ? "http_5xx" : "http_4xx";
}
