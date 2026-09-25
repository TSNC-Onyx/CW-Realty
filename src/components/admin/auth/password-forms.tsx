"use client";

import { AdminField } from "@/components/admin/admin-field";
import { AuthForm } from "@/components/admin/auth/auth-form";
import { TurnstileField } from "@/components/forms/turnstile-field";
import { useAuthForm } from "@/components/admin/auth/use-auth-form";
import { IDLE_ACTION_STATE } from "@/lib/admin/action-state";
import { requestPasswordResetAction, setPasswordAction } from "@/lib/admin/auth-actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/admin/auth-schemas";

export function ForgotPasswordForm() {
  const { state, isPending, handleSubmit } = useAuthForm(requestPasswordResetAction, IDLE_ACTION_STATE);
  return (
    <AuthForm state={state} isPending={isPending} submitLabel="Send reset link" pendingLabel="Sending…" onSubmit={handleSubmit}>
      <AdminField name="email" label="Email" type="email" autoComplete="username" defaultValue={state.values.email} error={state.fieldErrors.email} />
      <TurnstileField action="admin-reset" resetKey={state.responseId} />
    </AuthForm>
  );
}

export function SetPasswordForm() {
  const { state, isPending, handleSubmit } = useAuthForm(setPasswordAction, IDLE_ACTION_STATE);
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
