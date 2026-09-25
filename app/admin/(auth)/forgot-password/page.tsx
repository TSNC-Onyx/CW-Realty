import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/admin/auth/password-forms";
import { TextLink } from "@/components/ui/text-link";
import { ADMIN_LOGIN_PATH } from "@/lib/admin/paths";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="type-h1 mb-2">Reset your password</h1>
      <p className="type-lead mb-6">Enter your admin email and we&apos;ll send a link to choose a new password.</p>
      <ForgotPasswordForm />
      <div className="mt-6">
        <TextLink href={ADMIN_LOGIN_PATH}>Back to sign in</TextLink>
      </div>
    </>
  );
}
