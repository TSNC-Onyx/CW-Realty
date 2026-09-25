"use client";

import Link from "next/link";

import { AdminField } from "@/components/admin/admin-field";
import { AuthForm } from "@/components/admin/auth/auth-form";
import { useAuthForm } from "@/components/admin/auth/use-auth-form";
import { IDLE_ACTION_STATE } from "@/lib/admin/action-state";
import { signInAction } from "@/lib/admin/auth-actions";
import { ADMIN_FORGOT_PASSWORD_PATH } from "@/lib/admin/paths";

export function LoginForm({ next }: { next: string }) {
  const { state, isPending, handleSubmit } = useAuthForm(signInAction, IDLE_ACTION_STATE);
  return (
    <AuthForm state={state} isPending={isPending} submitLabel="Sign in" pendingLabel="Signing in…" onSubmit={handleSubmit}>
      <input type="hidden" name="next" value={next} />
      <AdminField name="email" label="Email" type="email" autoComplete="username" defaultValue={state.values.email} error={state.fieldErrors.email} />
      <AdminField name="password" label="Password" type="password" autoComplete="current-password" error={state.fieldErrors.password} />
      <Link href={ADMIN_FORGOT_PASSWORD_PATH} className="text-link justify-self-start">
        Forgot your password?
      </Link>
    </AuthForm>
  );
}
