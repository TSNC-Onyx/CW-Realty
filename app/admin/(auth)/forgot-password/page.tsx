import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/admin/auth/password-forms";
import { TextLink } from "@/components/ui/text-link";
import { ADMIN_LOGIN_PATH } from "@/lib/admin/paths";
import { getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage() {
  const contact = getContactLinks(await fetchSiteSettings());
  return (
    <>
      <h1 className="type-h1 mb-2">Reset your password</h1>
      <p className="type-lead mb-6">Enter your admin email and we&apos;ll send a link to choose a new password.</p>
      <ForgotPasswordForm contact={contact} />
      <div className="mt-6">
        <TextLink href={ADMIN_LOGIN_PATH}>Back to sign in</TextLink>
      </div>
    </>
  );
}
