import { unstable_rethrow } from "next/navigation";

import { getErrorState, getFormValues, type ActionState } from "@/lib/admin/action-state";
import { getQuickError, type QuickResult } from "@/lib/admin/quick-result";
import type { BrowserProblemCode } from "@/lib/observability/client-problem";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import type { ProblemSeverity } from "@/lib/observability/problem-types";
import { reportClientProblem } from "@/lib/observability/report-client-problem";

// Browser side of calling an admin server action. When the call itself fails — the site was
// updated while the page was open, or the connection dropped — the person gets a clear
// message instead of a crash screen, and the problem is recorded
// (docs/cwr-error-tracking-plan.md).

type CallFailure = { code: BrowserProblemCode; severity: ProblemSeverity; message: string };

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
