import { unstable_rethrow } from "next/navigation";

import { getErrorState, getFormValues, type ActionState } from "@/lib/admin/action-state";
import { getQuickError, type QuickResult } from "@/lib/admin/quick-result";
import type { BrowserProblemCode } from "@/lib/observability/client-problem";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import type { ProblemSeverity } from "@/lib/observability/problem-types";
import { reportClientProblem, reportVisitorClientProblem } from "@/lib/observability/report-client-problem";

// Browser side of calling an admin server action. When the call itself fails — the site was
// updated while the page was open, or the connection dropped — the person gets a clear
// message instead of a crash screen, and the problem is recorded
// (docs/cwr-error-tracking-plan.md).

export type CallFailure = { code: BrowserProblemCode; severity: ProblemSeverity; message: string };

/**
 * member: admin and sign-in pages (the message carries a reference code) · visitor: website
 * visitors, who never see a reference code (docs/cwr-reliability-round-plan.md, Phase 1).
 */
type CallReportingMode = "member" | "visitor";

type CallReportingOptions<State> = {
  action: ProblemAction;
  mode: CallReportingMode;
  /** The state to show for a failed call; failure.message is ready to display. */
  onFailure: (failure: CallFailure, formData: FormData) => State;
};

const STALE_PAGE_PATTERN = /server action/i;
const NETWORK_PATTERN = /failed to fetch|load failed|networkerror|network request failed/i;

const STALE_PAGE_FAILURE: CallFailure = { code: "stale_page", severity: "warning", message: "The site was just updated. Refresh the page, then try again." };
const NETWORK_FAILURE: CallFailure = { code: "network", severity: "warning", message: "Connection problem. Check your internet and try again." };
const OTHER_FAILURE: CallFailure = { code: "other", severity: "error", message: "That didn't work. Refresh the page and try again." };

export function getCallFailure(error: unknown): CallFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (STALE_PAGE_PATTERN.test(message)) return STALE_PAGE_FAILURE;
  if (error instanceof TypeError && NETWORK_PATTERN.test(message)) return NETWORK_FAILURE;
  return OTHER_FAILURE;
}

async function getReportedCallMessage(action: ProblemAction, error: unknown): Promise<string> {
  const failure = getCallFailure(error);
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const reference = await reportClientProblem({ action, stage: "network", severity: failure.severity, code: failure.code, shownMessage: failure.message, detail });
  return reference ? `${failure.message} (Ref ${reference})` : failure.message;
}

async function getReportedVisitorFailure(action: ProblemAction, error: unknown): Promise<CallFailure> {
  const failure = getCallFailure(error);
  await reportVisitorClientProblem({ action, stage: "network", severity: failure.severity, code: failure.code === "other" ? "action_failed" : failure.code });
  return failure;
}

async function getReportedFailure({ action, mode, error }: { action: ProblemAction; mode: CallReportingMode; error: unknown }): Promise<CallFailure> {
  if (mode === "visitor") return getReportedVisitorFailure(action, error);
  return { ...getCallFailure(error), message: await getReportedCallMessage(action, error) };
}

/** For one-click actions: a failed call becomes an error result, never an exception. */
export async function callQuickAction(action: ProblemAction, run: () => Promise<QuickResult>): Promise<QuickResult> {
  try {
    return await run();
  } catch (error) {
    // Redirects (for example to sign-in) are how Next.js navigates, not failures.
    unstable_rethrow(error);
    return getQuickError(await getReportedCallMessage(action, error));
  }
}

/** For forms: wraps the server action handed to useActionState. */
export function withCallReporting(
  action: ProblemAction,
  serverAction: (state: ActionState, formData: FormData) => Promise<ActionState>,
): (state: ActionState, formData: FormData) => Promise<ActionState> {
  return async (state, formData) => {
    try {
      return await serverAction(state, formData);
    } catch (error) {
      unstable_rethrow(error);
      return getErrorState({ message: await getReportedCallMessage(action, error), values: getFormValues(formData) });
    }
  };
}

/**
 * For forms whose state isn't the admin ActionState, or that need their own failure state
 * (docs/cwr-stale-quick-check-addendum.md §2). withCallReporting above is unchanged.
 */
export function withCallReportingFor<State>({ action, mode, onFailure }: CallReportingOptions<State>, serverAction: (state: State, formData: FormData) => Promise<State>): (state: State, formData: FormData) => Promise<State> {
  return async (state, formData) => {
    try {
      return await serverAction(state, formData);
    } catch (error) {
      unstable_rethrow(error);
      return onFailure(await getReportedFailure({ action, mode, error }), formData);
    }
  };
}
