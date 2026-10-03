"use client";

import Link from "next/link";
import { useRef, type FormEvent } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { AuthForm } from "@/components/admin/auth/auth-form";
import { SignInBotCheck, useSignInBotCheck } from "@/components/admin/auth/sign-in-bot-check";
import { getSignInCallFailureState, SignInRecovery, useRestoredEmail } from "@/components/admin/auth/sign-in-recovery";
import { useAuthForm } from "@/components/admin/auth/use-auth-form";
import { IDLE_ACTION_STATE } from "@/lib/admin/action-state";
import { signInAction } from "@/lib/admin/auth-actions";
import { ADMIN_FORGOT_PASSWORD_PATH } from "@/lib/admin/paths";
import { withCallReportingFor } from "@/lib/observability/call-server-action";
import type { ContactLinks } from "@/lib/site/contact-links";

const FORM_ID = "admin-login";

const reportedSignInAction = withCallReportingFor({ action: "auth.sign_in", mode: "member", onFailure: getSignInCallFailureState }, signInAction);

/** contact: the office phone, offered if refreshing an out-of-date page doesn't help. */
export function LoginForm({ next, contact }: { next: string; contact: ContactLinks | null }) {
  const { state, isPending, handleSubmit } = useAuthForm(reportedSignInAction, IDLE_ACTION_STATE);
  const botCheck = useSignInBotCheck(state.responseId);
  const formRef = useRef<HTMLFormElement>(null);
  const restoredEmail = useRestoredEmail({ formId: FORM_ID, formRef });

  const handleSignIn = (event: FormEvent<HTMLFormElement>) => {
    if (botCheck.handleSubmitAttempt(event.currentTarget)) handleSubmit(event);
    else event.preventDefault();
  };

  return (
    <AuthForm
      state={state}
      isPending={isPending || botCheck.isHolding}
      submitLabel="Sign in"
      pendingLabel="Signing in…"
      onSubmit={handleSignIn}
      formId={FORM_ID}
      formRef={formRef}
      notice={<SignInRecovery formId={FORM_ID} state={state} problemAction="auth.sign_in" formRef={formRef} contact={contact} />}
    >
      <input type="hidden" name="next" value={next} />
      <div inert={botCheck.isHolding} className="contents">
        <AdminField key={restoredEmail ?? "typed"} name="email" label="Email" type="email" autoComplete="username" defaultValue={restoredEmail ?? state.values.email} error={state.fieldErrors.email} />
        <AdminField name="password" label="Password" type="password" autoComplete="current-password" error={state.fieldErrors.password} />
      </div>
      <SignInBotCheck action="admin-sign-in" botCheck={botCheck} />
      <Link href={ADMIN_FORGOT_PASSWORD_PATH} className="text-link justify-self-start">
        Forgot your password?
      </Link>
    </AuthForm>
  );
}
