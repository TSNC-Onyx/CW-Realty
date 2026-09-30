import type { ProblemAction } from "@/lib/observability/problem-catalog";

// Shared vocabulary for recorded problems (docs/cwr-error-tracking-plan.md). Safe to import
// from browser and server code alike.

/** Where the problem happened on its way through the site. */
export type ProblemStage =
  | "validate"
  | "rule"
  | "not_found"
  | "access"
  | "duplicate"
  | "database"
  | "storage"
  | "browser"
  | "network"
  | "external"
  | "load"
  | "auth"
  | "job"
  | "unexpected"
  | "setup";

/**
 * info: the person can fix it (a typo, a name already in use). warning: done but degraded,
 * or stale input. error: something is broken. critical: an outage or a half-finished change.
 */
export type ProblemSeverity = "info" | "warning" | "error" | "critical";

/** Who reported it. Only trusted server code chooses this, never the browser. */
export type ProblemOrigin = "server_member" | "server_signin" | "browser_member" | "browser_signin" | "job" | "database" | "github";

export type ProblemEvent = {
  action: ProblemAction;
  stage: ProblemStage;
  severity: ProblemSeverity;
  origin: ProblemOrigin;
  code?: string | null;
  shownMessage?: string | null;
  detail?: string | null;
  tenantId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  recordTable?: string | null;
  recordId?: string | null;
  requestId?: string | null;
  pagePath?: string | null;
  release?: string | null;
  digest?: string | null;
};

/** stored: "unknown" when the write was still running when the person had to be answered. */
export type ProblemRecordResult = { reference: string; stored: boolean | "unknown"; isSuppressed: boolean };

const SEVERITY_RANK: Record<ProblemSeverity, number> = { info: 1, warning: 2, error: 3, critical: 4 };

/** Warnings and worse are worth a reference code on screen; typing mistakes are not. */
export function isReferenceWorthy(severity: ProblemSeverity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK.warning;
}
