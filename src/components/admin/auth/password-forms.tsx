"use client";

import { AdminField } from "@/components/admin/admin-field";
import { AuthForm } from "@/components/admin/auth/auth-form";
import { SignInBotCheck } from "@/components/admin/auth/sign-in-bot-check";
import { useAuthForm } from "@/components/admin/auth/use-auth-form";
import { IDLE_ACTION_STATE } from "@/lib/admin/action-state";
import { requestPasswordResetAction, setPasswordAction } from "@/lib/admin/auth-actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/admin/auth-schemas";
import { withCallReporting } from "@/lib/observability/call-server-action";

const reportedPasswordResetAction = withCallReporting("auth.request_password_reset", requestPasswordResetAction);
const reportedSetPasswordAction = withCallReporting("auth.set_password", setPasswordAction);

export function ForgotPasswordForm() {
  const { state, isPending, handleSubmit } = useAuthForm(reportedPasswordResetAction, IDLE_ACTION_STATE);
  return (
    <AuthForm state={state} isPending={isPending} submitLabel="Send reset link" pendingLabel="Sending…" onSubmit={handleSubmit}>
      <AdminField name="email" label="Email" type="email" autoComplete="username" defaultValue={state.values.email} error={state.fieldErrors.email} />
      <SignInBotCheck action="admin-reset" resetKey={state.responseId} />
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
