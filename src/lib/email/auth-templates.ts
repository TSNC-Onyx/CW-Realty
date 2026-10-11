// Every email Supabase Auth can send (13 types), built from the shared layout so a Supabase
// default is never used (docs/cwr-branded-email-templates-plan.md, Phase 2).
// supabase/templates/*.html are generated from this file (npm run email:templates), local
// Supabase reads them through supabase/config.toml, and the hosted project gets them from
// scripts/push-auth-email-templates.mjs (docs/runbooks/auth-email-templates.md).
// Supabase fills in the {{ .Name }} values; invite and reset links must stay exactly as they are.

import { FIRM_NAME, getBrandedEmailHtml, type EmailButton } from "@/lib/email/layout";

export type AuthEmailKind = "template" | "notification";

export type AuthEmailTemplate = {
  /** Supabase's name for the email, as used in config.toml and the Management API. */
  type: string;
  kind: AuthEmailKind;
  fileName: string;
  subject: string;
  /** The Supabase values this email may use (anything else fails the template test). */
  allowedVariables: string[];
  html: string;
};

type AuthEmailContent = Omit<AuthEmailTemplate, "fileName" | "html"> & {
  preheader: string;
  heading: string;
  paragraphs: string[];
  button?: EmailButton;
};

const CONFIRM_LINK = "{{ .SiteURL }}/admin/auth/confirm?token_hash={{ .TokenHash }}&type=";
const SIGN_IN_LINK = "{{ .SiteURL }}/admin/login";
const FORGOT_PASSWORD_LINK = "{{ .SiteURL }}/admin/forgot-password";
const LINK_VARIABLES = ["{{ .SiteURL }}", "{{ .TokenHash }}"];
const SITE_VARIABLES = ["{{ .SiteURL }}"];
const FOOTER_LINES = [FIRM_NAME];
const CONTACT_US = `If you didn't expect this, contact ${FIRM_NAME} right away.`;
const IGNORE_IT = "If you didn't ask for this, you can ignore this email — nothing has changed.";
const PASSWORD_ONLY = "The website signs in with your email and password only";

const AUTH_EMAILS: AuthEmailContent[] = [
  {
    type: "invite",
    kind: "template",
    subject: "Your invite to the CWR admin portal",
    allowedVariables: LINK_VARIABLES,
    preheader: "Accept your invite and set your password.",
    heading: "You're invited to the CWR admin portal",
    paragraphs: [
      "Charlie Ward Realty has given you access to update the website.",
      "This link works once and expires in 24 hours. After you set a password, you'll sign in with your email and that password.",
      "If you weren't expecting this, you can ignore this email.",
    ],
    button: { label: "Accept the invite and set your password", url: `${CONFIRM_LINK}invite` },
  },
  {
    type: "recovery",
    kind: "template",
    subject: "Reset your CWR admin password",
    allowedVariables: LINK_VARIABLES,
    preheader: "This link works once and expires in one hour.",
    heading: "Reset your CWR admin password",
    paragraphs: [
      "Someone asked to reset the password for this admin account.",
      "This link works once and expires in one hour. If you didn't ask for this, you can ignore this email — your password won't change.",
    ],
    button: { label: "Choose a new password", url: `${CONFIRM_LINK}recovery` },
  },
  {
    type: "confirmation",
    kind: "template",
    subject: "CWR admin portal: no sign-up needed",
    allowedVariables: [],
    preheader: "New admins are invited by the owner.",
    heading: "Sign-up isn't used on the CWR admin portal",
    paragraphs: [
      "Someone asked to confirm a new account for this email address. The website doesn't use sign-up — new admins are invited by the owner, so there's no link in this email.",
      `If you're waiting for an invite, ask ${FIRM_NAME} to send it again. ${IGNORE_IT}`,
    ],
  },
  {
    type: "magic_link",
    kind: "template",
    subject: "CWR admin portal sign-in request",
    allowedVariables: SITE_VARIABLES,
    preheader: "Sign in with your email and password instead.",
    heading: "Sign-in links aren't used",
    paragraphs: [
      `Someone asked for a sign-in link for this email address. ${PASSWORD_ONLY} so there's no link in this email.`,
      `Forgot your password? Use "Forgot password" on the sign-in page. ${IGNORE_IT}`,
    ],
    button: { label: "Go to the sign-in page", url: SIGN_IN_LINK },
  },
  {
    type: "email_change",
    kind: "template",
    subject: "Email change request for your CWR admin account",
    allowedVariables: ["{{ .NewEmail }}"],
    preheader: "Nothing was changed.",
    heading: "Email changes aren't made this way",
    paragraphs: [
      "Someone asked to change the email address on this CWR admin account to {{ .NewEmail }}. The website doesn't change email addresses this way, so nothing was changed and there's no link in this email.",
      `To change an admin's email address, ask ${FIRM_NAME}. ${CONTACT_US}`,
    ],
  },
  {
    type: "reauthentication",
    kind: "template",
    subject: "CWR admin portal verification request",
    allowedVariables: SITE_VARIABLES,
    preheader: "No code is needed.",
    heading: "Verification codes aren't used",
    paragraphs: [
      `Someone signed in to your CWR admin account asked for a verification code. ${PASSWORD_ONLY} so no code is included.`,
      `If this wasn't you, reset your password right away and contact ${FIRM_NAME}.`,
    ],
    button: { label: "Reset your password", url: FORGOT_PASSWORD_LINK },
  },
  {
    type: "password_changed",
    kind: "notification",
    subject: "Your CWR admin password was set or changed",
    allowedVariables: ["{{ .SiteURL }}", "{{ .Email }}"],
    preheader: "If this was you, there's nothing to do.",
    heading: "Your password was set or changed",
    paragraphs: [
      "The password for {{ .Email }} on the CWR admin portal was just set or changed.",
      "If this was you — for example after accepting an invite or resetting your password — you don't need to do anything.",
      `If it wasn't you, reset your password right away and contact ${FIRM_NAME}.`,
    ],
    button: { label: "Reset your password", url: FORGOT_PASSWORD_LINK },
  },
  {
    type: "email_changed",
    kind: "notification",
    subject: "The email on your CWR admin account changed",
    allowedVariables: ["{{ .OldEmail }}", "{{ .Email }}"],
    preheader: "Your sign-in email address is different now.",
    heading: "Your sign-in email changed",
    paragraphs: ["The sign-in email for your CWR admin account changed from {{ .OldEmail }} to {{ .Email }}.", CONTACT_US],
  },
  {
    type: "phone_changed",
    kind: "notification",
    subject: "The phone number on your CWR admin account changed",
    allowedVariables: [],
    preheader: "Phone numbers aren't used to sign in.",
    heading: "Your account phone number changed",
    paragraphs: [`The phone number on your CWR admin account changed. ${PASSWORD_ONLY}.`, CONTACT_US],
  },
  {
    type: "identity_linked",
    kind: "notification",
    subject: "A sign-in method was added to your CWR admin account",
    allowedVariables: [],
    preheader: "Check that this was you.",
    heading: "A sign-in method was added",
    paragraphs: [`A new sign-in method was added to your CWR admin account. ${PASSWORD_ONLY}.`, CONTACT_US],
  },
  {
    type: "identity_unlinked",
    kind: "notification",
    subject: "A sign-in method was removed from your CWR admin account",
    allowedVariables: [],
    preheader: "Check that this was you.",
    heading: "A sign-in method was removed",
    paragraphs: [`A sign-in method was removed from your CWR admin account. ${PASSWORD_ONLY}.`, CONTACT_US],
  },
  {
    type: "mfa_factor_enrolled",
    kind: "notification",
    subject: "A sign-in code method was added to your CWR admin account",
    allowedVariables: [],
    preheader: "Check that this was you.",
    heading: "A sign-in code method was added",
    paragraphs: [`A sign-in code method was added to your CWR admin account. ${PASSWORD_ONLY} so it isn't needed.`, CONTACT_US],
  },
  {
    type: "mfa_factor_unenrolled",
    kind: "notification",
    subject: "A sign-in code method was removed from your CWR admin account",
    allowedVariables: [],
    preheader: "This is expected — sign-in codes are no longer used.",
    heading: "A sign-in code method was removed",
    paragraphs: [
      `A sign-in code method was removed from your CWR admin account. ${PASSWORD_ONLY} so old codes are being cleaned up and you don't need to do anything.`,
      `If you have questions, contact ${FIRM_NAME}.`,
    ],
  },
];

function getFileName({ type, kind }: AuthEmailContent): string {
  return kind === "notification" ? `${type}_notification.html` : `${type}.html`;
}

function getTemplate(content: AuthEmailContent): AuthEmailTemplate {
  const { preheader, heading, paragraphs, button, ...template } = content;
  const bodyHtml = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
  const html = `${getBrandedEmailHtml({ preheader, heading, bodyHtml, button, footerLines: FOOTER_LINES })}\n`;
  return { ...template, fileName: getFileName(content), html };
}

export function getAuthEmailTemplates(): AuthEmailTemplate[] {
  return AUTH_EMAILS.map(getTemplate);
}
