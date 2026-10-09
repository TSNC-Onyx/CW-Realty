// Supabase Auth sign-in emails (invite, password reset) built from the shared layout.
// supabase/templates/*.html are generated from this file (npm run email:templates) and the
// hosted copies are pasted in from those files (docs/runbooks/auth-email-templates.md).
// Supabase fills in {{ .SiteURL }} and {{ .TokenHash }}; the links must stay exactly as they are.

import { FIRM_NAME, getBrandedEmailHtml } from "@/lib/email/layout";

export type AuthEmailTemplate = { fileName: string; html: string };

const CONFIRM_LINK = "{{ .SiteURL }}/admin/auth/confirm?token_hash={{ .TokenHash }}&type=";
const FOOTER_LINES = [FIRM_NAME];

function getInviteHtml(): string {
  return getBrandedEmailHtml({
    preheader: "Accept your invite and set your password.",
    heading: "You're invited to the CWR admin portal",
    bodyHtml:
      "<p>Charlie Ward Realty has given you access to update the website.</p>" +
      "<p>This link works once and expires in 24 hours. After you set a password, you'll connect an authenticator app for sign-in codes.</p>" +
      "<p>If you weren't expecting this, you can ignore this email.</p>",
    button: { label: "Accept the invite and set your password", url: `${CONFIRM_LINK}invite` },
    footerLines: FOOTER_LINES,
  });
}

function getRecoveryHtml(): string {
  return getBrandedEmailHtml({
    preheader: "This link works once and expires in one hour.",
    heading: "Reset your CWR admin password",
    bodyHtml:
      "<p>Someone asked to reset the password for this admin account.</p>" +
      "<p>This link works once and expires in one hour. If you didn't ask for this, you can ignore this email — your password won't change.</p>",
    button: { label: "Choose a new password", url: `${CONFIRM_LINK}recovery` },
    footerLines: FOOTER_LINES,
  });
}

export function getAuthEmailTemplates(): AuthEmailTemplate[] {
  return [
    { fileName: "invite.html", html: `${getInviteHtml()}\n` },
    { fileName: "recovery.html", html: `${getRecoveryHtml()}\n` },
  ];
}
