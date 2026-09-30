import "server-only";

import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";

import { DuplicateSubmitError } from "@/lib/admin/idempotency";
import { getQuickError, type QuickResult } from "@/lib/admin/quick-result";
import { getAlreadyReportedCause, getReportedFailureMessage, getUnexpectedCause } from "@/lib/admin/report-action-failure";
import { AdminAccessError, requireAdmin, type AdminContext } from "@/lib/admin/require-admin";
import type { AdminActionOptions } from "@/lib/admin/run-admin-action";
import { noteProblemCause, runInActionContext } from "@/lib/observability/action-context";
import { ReportedProblemError } from "@/lib/observability/reported-problem-error";

// Boundary for one-click admin actions: role check first, plain messages out, and every
// failure the person sees recorded (docs/cwr-error-tracking-plan.md).

const UNEXPECTED_MESSAGE = "That didn't work. Refresh the page and try again.";

async function getQuickResult(roles: AdminActionOptions["roles"], work: (admin: AdminContext) => Promise<QuickResult>): Promise<QuickResult> {
  try {
    return await work(await requireAdmin(roles));
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ReportedProblemError) {
      noteProblemCause(getAlreadyReportedCause(error));
      return getQuickError(error.message);
    }
    if (error instanceof AdminAccessError) noteProblemCause({ stage: "access", severity: "warning", code: "wrong_role", detail: null });
    if (error instanceof DuplicateSubmitError) noteProblemCause({ stage: "duplicate", severity: "info", code: "duplicate_submit", detail: null });
    if (error instanceof AdminAccessError || error instanceof DuplicateSubmitError) return getQuickError(error.message);
    // A malformed id or choice can only come from a stale page or a tampered request.
    if (error instanceof ZodError) noteProblemCause({ stage: "validate", severity: "warning", code: "ZodError", detail: error.issues[0]?.message ?? null });
    else noteProblemCause(getUnexpectedCause(error));
    return getQuickError(UNEXPECTED_MESSAGE);
  }
}

export function runQuickAction({ action, roles }: AdminActionOptions, work: (admin: AdminContext) => Promise<QuickResult>): Promise<QuickResult> {
  return runInActionContext(action, async () => {
    const result = await getQuickResult(roles, work);
    if (result.status !== "error") return result;
    return getQuickError(await getReportedFailureMessage({ action, message: result.message, hasFieldErrors: false }));
  });
}
