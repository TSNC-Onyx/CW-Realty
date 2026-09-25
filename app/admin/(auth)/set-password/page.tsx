import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetPasswordForm } from "@/components/admin/auth/password-forms";
import { fetchHasVerifiedFactor, fetchSignInStage } from "@/lib/admin/auth-pages";
import { ADMIN_LOGIN_PATH, ADMIN_MFA_PATH, ADMIN_SET_PASSWORD_PATH } from "@/lib/admin/paths";

export const metadata: Metadata = { title: "Choose a password" };

// Reached from an invite or password-reset email. Someone who already uses sign-in
// codes confirms a code first, so a stolen email link alone cannot change the password.
export default async function SetPasswordPage() {
  const stage = await fetchSignInStage();
  if (stage === "signed-out") redirect(ADMIN_LOGIN_PATH);
  if (stage === "password-only" && (await fetchHasVerifiedFactor())) redirect(`${ADMIN_MFA_PATH}?next=${encodeURIComponent(ADMIN_SET_PASSWORD_PATH)}`);
  return (
    <>
      <h1 className="type-h1 mb-6">Choose a password</h1>
      <SetPasswordForm />
    </>
  );
}
