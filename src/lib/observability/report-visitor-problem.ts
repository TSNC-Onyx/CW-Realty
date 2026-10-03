import "server-only";

import type { ProblemAction } from "@/lib/observability/problem-catalog";
import type { ProblemSeverity, ProblemStage } from "@/lib/observability/problem-types";
import { reportProblem } from "@/lib/observability/report-problem";

// Server-side record of a problem a website visitor ran into (docs/cwr-reliability-round-plan.md,
// Phase 1). Visitors are never signed in and never see a reference code. Only what our own
// code knows is stored — an error's name, a status or a provider's code — never what the
// visitor typed. Like reportProblem, it never throws.

export type VisitorProblem = {
  action: Extract<ProblemAction, `site.${string}`>;
  stage: ProblemStage;
  severity: ProblemSeverity;
  code: string;
  /** Our own words or a provider's codes; never visitor text. */
  detail?: string;
};

export async function reportVisitorProblem(problem: VisitorProblem): Promise<void> {
  await reportProblem({ ...problem, origin: "server_visitor", actorId: null, actorRole: null });
}

/** The error's class name only: messages can repeat what the visitor typed. */
export function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}
