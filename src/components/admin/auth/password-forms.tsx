"use client";

import { useRef, type FormEvent } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { AuthForm } from "@/components/admin/auth/auth-form";
import { SignInBotCheck, useSignInBotCheck } from "@/components/admin/auth/sign-in-bot-check";
import { getSignInCallFailureState, SignInRecovery, useRestoredEmail } from "@/components/admin/auth/sign-in-recovery";
import { useAuthForm } from "@/components/admin/auth/use-auth-form";
import { IDLE_ACTION_STATE } from "@/lib/admin/action-state";
import { requestPasswordResetAction, setPasswordAction } from "@/lib/admin/auth-actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/admin/auth-schemas";
import { withCallReporting, withCallReportingFor } from "@/lib/observability/call-server-action";
import type { ContactLinks } from "@/lib/site/contact-links";

const RESET_FORM_ID = "admin-password-reset";

const reportedPasswordResetAction = withCallReportingFor({ action: "auth.request_password_reset", mode: "member", onFailure: getSignInCallFailureState }, requestPasswordResetAction);
const reportedSetPasswordAction = withCallReporting("auth.set_password", setPasswordAction);

export function ForgotPasswordForm({ contact }: { contact: ContactLinks | null }) {
  const { state, isPending, handleSubmit } = useAuthForm(reportedPasswordResetAction, IDLE_ACTION_STATE);
  const botCheck = useSignInBotCheck(state.responseId);
  const formRef = useRef<HTMLFormElement>(null);
  const restoredEmail = useRestoredEmail({ formId: RESET_FORM_ID, formRef });

  const handleRequest = (event: FormEvent<HTMLFormElement>) => {
    if (botCheck.handleSubmitAttempt(event.currentTarget)) handleSubmit(event);
    else event.preventDefault();
  };

  return (
    <AuthForm
      state={state}
      isPending={isPending || botCheck.isHolding}
      submitLabel="Send reset link"
      pendingLabel="Sending…"
      onSubmit={handleRequest}
      formId={RESET_FORM_ID}
      formRef={formRef}
      notice={<SignInRecovery formId={RESET_FORM_ID} state={state} problemAction="auth.request_password_reset" formRef={formRef} contact={contact} />}
    >
      <div inert={botCheck.isHolding} className="contents">
        <AdminField key={restoredEmail ?? "typed"} name="email" label="Email" type="email" autoComplete="username" defaultValue={restoredEmail ?? state.values.email} error={state.fieldErrors.email} />
      </div>
      <SignInBotCheck action="admin-reset" botCheck={botCheck} />
    </AuthForm>
  );
}

export function SetPasswordForm() {
  const { state, isPending, handleSubmit } = useAuthForm(reportedSetPasswordAction, IDLE_ACTION_STATE);
  return (
    <AuthForm state={state} isPending={isPending} submitLabel="Save password" pendingLabel="Saving…" onSubmit={handleSubmit}>
      <AdminField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        helperText={`At least ${MIN_PASSWORD_LENGTH} characters, with a lowercase letter, an uppercase letter, and a number.`}
        error={state.fieldErrors.password}
      />
      <AdminField name="confirmPassword" label="Type it again" type="password" autoComplete="new-password" error={state.fieldErrors.confirmPassword} />
    </AuthForm>
  );
}
