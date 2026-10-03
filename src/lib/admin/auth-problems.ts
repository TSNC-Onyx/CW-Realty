import "server-only";

import { unstable_rethrow } from "next/navigation";

import { getFailedStepOutcome, getOutcomeMessage, type AuthOutcome, type AuthProblemOutcome } from "@/lib/admin/auth-outcomes";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import type { ProblemRecordResult } from "@/lib/observability/problem-types";
import { reportProblem } from "@/lib/observability/report-problem";

// Records problems on the sign-in steps (docs/cwr-error-tracking-plan.md, Auth). Only the
// error's name, status and message are kept — never the email address, password, or code
// someone typed.

type AuthProblem<Outcome> = { action: ProblemAction; error: unknown; outcome: Outcome };

type SignInStepBoundary<State> = { action: ProblemAction; failureMessage: string; getFailedState: (message: string) => State };

function getAuthProblemDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const status = "status" in error ? ` (status ${String(error.status)})` : "";
  return `${error.name}${status}: ${error.message}`;
}

export async function reportAuthProblem({ action, error, outcome }: AuthProblem<AuthProblemOutcome>): Promise<ProblemRecordResult> {
  return reportProblem({ action, stage: "auth", severity: outcome.severity, code: outcome.code, shownMessage: outcome.shownMessage, detail: getAuthProblemDetail(error) });
}

/** Records the problem and returns the message to show, with its reference when it has one. */
export async function reportAuthFailure({ action, error, outcome }: AuthProblem<AuthOutcome>): Promise<string> {
  const record = await reportAuthProblem({ action, error, outcome });
  return getOutcomeMessage({ outcome, record });
}

/** A sign-in page built before the latest Quick Check keys (docs/cwr-stale-quick-check-addendum.md). */
export async function reportOutdatedSignInPage(action: ProblemAction): Promise<void> {
  await reportProblem({ action, stage: "validate", severity: "warning", code: "outdated_page" });
}

/**
 * Boundary for a sign-in step: anything it throws (other than a redirect) is recorded as
 * critical and shown as a plain message, never a crash screen.
 */
export async function runSignInStep<State>({ action, failureMessage, getFailedState }: SignInStepBoundary<State>, step: () => Promise<State>): Promise<State> {
  try {
    return await step();
  } catch (error) {
    unstable_rethrow(error);
    const message = await reportAuthFailure({ action, error, outcome: getFailedStepOutcome({ error, shownMessage: failureMessage }) });
    return getFailedState(message);
  }
}
