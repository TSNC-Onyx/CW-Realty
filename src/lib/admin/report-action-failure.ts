import "server-only";

import { takeProblemCause, type ProblemCause } from "@/lib/observability/action-context";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { isReferenceWorthy } from "@/lib/observability/problem-types";
import { getReferenceSuffix } from "@/lib/observability/reference";
import { reportProblem } from "@/lib/observability/report-problem";
import type { ReportedProblemError } from "@/lib/observability/reported-problem-error";
import { getOwnStackFrames } from "@/lib/observability/scrub";

// Records the failure an admin action is about to show, and adds a reference code to the
// message when it is worth quoting (docs/cwr-error-tracking-plan.md, owner rule 2026-09-27).

const VALIDATION_CAUSE: ProblemCause = { stage: "validate", severity: "info", code: "fields", detail: null };
const RULE_CAUSE: ProblemCause = { stage: "rule", severity: "info", code: null, detail: null };

export function getUnexpectedCause(error: unknown): ProblemCause {
  if (!(error instanceof Error)) return { stage: "unexpected", severity: "error", code: "NonError", detail: String(error) };
  const stack = getOwnStackFrames(error.stack);
  return { stage: "unexpected", severity: "error", code: error.name, detail: stack ? `${error.message}\n${stack}` : error.message };
}

/** A problem recorded where it happened: shown as is, never recorded twice. */
export function getAlreadyReportedCause(error: ReportedProblemError): ProblemCause {
  return { stage: "unexpected", severity: "error", code: error.name, detail: null, reference: error.context.reference };
}

export async function getReportedFailureMessage({ action, message, hasFieldErrors }: { action: ProblemAction; message: string; hasFieldErrors: boolean }): Promise<string> {
  const cause = takeProblemCause() ?? (hasFieldErrors ? VALIDATION_CAUSE : RULE_CAUSE);
  if (cause.reference) return message;
  const result = await reportProblem({ action, stage: cause.stage, severity: cause.severity, code: cause.code, detail: cause.detail, shownMessage: message });
  if (!isReferenceWorthy(cause.severity)) return message;
  return `${message}${getReferenceSuffix({ reference: result.reference, isStored: result.stored === true })}`;
}
