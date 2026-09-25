"use client";

import { AdminField } from "@/components/admin/admin-field";
import { AuthForm } from "@/components/admin/auth/auth-form";
import { useAuthForm } from "@/components/admin/auth/use-auth-form";
import { IDLE_ACTION_STATE } from "@/lib/admin/action-state";
import { verifyMfaAction } from "@/lib/admin/auth-actions";

export function MfaForm({ next }: { next: string }) {
  const { state, isPending, handleSubmit } = useAuthForm(verifyMfaAction, IDLE_ACTION_STATE);
  return (
    <AuthForm state={state} isPending={isPending} submitLabel="Verify code" pendingLabel="Checking…" onSubmit={handleSubmit}>
      <input type="hidden" name="next" value={next} />
      <AdminField
        name="code"
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        helperText="Open your authenticator app and enter the code shown for CWR."
        error={state.fieldErrors.code}
      />
    </AuthForm>
  );
}
