import "server-only";

import { unstable_rethrow } from "next/navigation";

import { getErrorState, type ActionState } from "@/lib/admin/action-state";
import { DuplicateSubmitError } from "@/lib/admin/idempotency";
import { getAlreadyReportedCause, getReportedFailureMessage, getUnexpectedCause } from "@/lib/admin/report-action-failure";
import { AdminAccessError, requireAdmin, type AdminContext, type AdminRole } from "@/lib/admin/require-admin";
import { noteProblemCause, runInActionContext } from "@/lib/observability/action-context";
import { ReportedProblemError } from "@/lib/observability/reported-problem-error";
import type { ProblemAction } from "@/lib/observability/problem-catalog";

// Boundary for every admin server action: checks the caller's role first, turns a wrong
// role into a plain message, and records every failure the person sees — with a reference
// code when it is worth quoting — instead of showing internals.

const UNEXPECTED_MESSAGE = "Something went wrong. Your changes were not saved. Try again in a moment.";

export type AdminActionOptions = { action: ProblemAction; roles: AdminRole[] };

async function getActionState(roles: AdminRole[], work: (admin: AdminContext) => Promise<ActionState>): Promise<ActionState> {
  try {
    const admin = await requireAdmin(roles);
    return await work(admin);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ReportedProblemError) {
      noteProblemCause(getAlreadyReportedCause(error));
      return getErrorState({ message: error.message });
    }
    if (error instanceof AdminAccessError) noteProblemCause({ stage: "access", severity: "warning", code: "wrong_role", detail: null });
    if (error instanceof DuplicateSubmitError) noteProblemCause({ stage: "duplicate", severity: "info", code: "duplicate_submit", detail: null });
    if (error instanceof AdminAccessError || error instanceof DuplicateSubmitError) return getErrorState({ message: error.message });
    noteProblemCause(getUnexpectedCause(error));
    return getErrorState({ message: UNEXPECTED_MESSAGE });
  }
}

export function runAdminAction({ action, roles }: AdminActionOptions, work: (admin: AdminContext) => Promise<ActionState>): Promise<ActionState> {
  return runInActionContext(action, async () => {
    const state = await getActionState(roles, work);
    if (state.status !== "error") return state;
    const message = await getReportedFailureMessage({ action, message: state.message, hasFieldErrors: Object.keys(state.fieldErrors).length > 0 });
    return { ...state, message };
  });
}
