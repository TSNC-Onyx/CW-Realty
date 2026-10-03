"use client";

import { useEffect, useState, type RefObject } from "react";

import { PageRefreshNotice, RefreshPageButton } from "@/components/forms/page-refresh-notice";
import { CallUsLink } from "@/components/forms/reach-us-directly";
import { useFormRestore } from "@/components/forms/use-form-restore";
import { getErrorState, type ActionState } from "@/lib/admin/action-state";
import type { CallFailure } from "@/lib/observability/call-server-action";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { reportClientProblem } from "@/lib/observability/report-client-problem";
import { BOT_CHECK_MESSAGES } from "@/lib/security/bot-check-messages";
import type { ContactLinks } from "@/lib/site/contact-links";

// Sign-in and password-reset pages that are out of date refresh themselves after 3 seconds,
// keeping the email (never the password), and the cursor lands on the password box only if
// it is still empty, so a password manager's autofill isn't disturbed (decision DA1;
// docs/cwr-stale-quick-check-addendum.md §3).

const EMAIL_FIELD = "email";
const PASSWORD_FIELD = "password";
const EMAIL_FIELDS = [EMAIL_FIELD];

/** A failed call to the sign-in server: an out-of-date page refreshes itself; only the email is kept. */
export function getSignInCallFailureState(failure: CallFailure, formData: FormData): ActionState {
  const state = getErrorState({ message: failure.message, values: { [EMAIL_FIELD]: String(formData.get(EMAIL_FIELD) ?? "") } });
  return failure.code === "stale_page" ? { ...state, recovery: "refresh" } : state;
}

/** The email typed before the page refreshed itself, or null. The form re-mounts its email box with it. */
export function useRestoredEmail({ formId, formRef }: { formId: string; formRef: RefObject<HTMLFormElement | null> }): string | null {
  const [restoredEmail, setRestoredEmail] = useState<string | null>(null);
  useFormRestore({ formId, fieldNames: EMAIL_FIELDS, onRestore: (restored) => setRestoredEmail(restored[EMAIL_FIELD] ?? null) });
  useEffect(() => {
    if (restoredEmail === null) return;
    const password = formRef.current?.elements.namedItem(PASSWORD_FIELD);
    if (password instanceof HTMLInputElement && password.value === "") password.focus();
  }, [restoredEmail, formRef]);
  return restoredEmail;
}

type SignInRecoveryProps = { formId: string; state: ActionState; problemAction: ProblemAction; formRef: RefObject<HTMLFormElement | null>; contact: ContactLinks | null };

function getTypedEmail(formRef: RefObject<HTMLFormElement | null>): Record<string, string> {
  const email = formRef.current?.elements.namedItem(EMAIL_FIELD);
  return { [EMAIL_FIELD]: email instanceof HTMLInputElement ? email.value : "" };
}

/** Refresh notice for an out-of-date page, or a Refresh page button after a refused Quick Check. */
export function SignInRecovery({ formId, state, problemAction, formRef, contact }: SignInRecoveryProps) {
  const getValues = () => getTypedEmail(formRef);
  const handleRefreshLoop = () => void reportClientProblem({ action: problemAction, stage: "browser", severity: "warning", code: "outdated_page_loop" });
  if (state.recovery === "refresh") return <PageRefreshNotice key={state.responseId} formId={formId} mode="automatic" getValues={getValues} onRefreshLoop={handleRefreshLoop} fallback={<CallUsLink contact={contact} />} />;
  if (state.status === "error" && state.message === BOT_CHECK_MESSAGES.refused) return <RefreshPageButton formId={formId} getValues={getValues} />;
  return null;
}
