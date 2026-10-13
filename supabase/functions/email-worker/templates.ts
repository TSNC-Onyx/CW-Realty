// Every Charlie Ward Realty email, in one place (docs/cwr-email-outbox-plan.md): the five site
// emails (Admin §5, Features §2) and the account emails Supabase Auth asks for. Every value is
// escaped for HTML and stripped of line breaks where it lands in a subject, so visitor input
// cannot change the message structure. `siteUrl` is the address that serves the new site
// (logo and links); the live site when left out.

import { FIRM_NAME, getBrandedEmailHtml, getEscapedHtml, type EmailButton } from "./layout.ts";
import type { OutgoingEmail } from "./mailersend.ts";
import { REPLY_PROMISE } from "./site-values.ts";

export { getEscapedHtml };

const STAFF_FOOTER_LINES = [`Sent by the ${FIRM_NAME} website`];

const SOURCE_LABELS: Record<string, string> = { contact: "Contact form", booking: "CWR TouchUp request", chat_handoff: "Chat assistant handoff" };

export type RequestSummary = {
  siteUrl?: string;
  threadUrl: string;
  source: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  subject: string;
  message: string;
};

export type OfficeContact = { phoneDisplay: string; email: string };

function getVisitorFooterLines(office: OfficeContact): string[] {
  return [`${FIRM_NAME} · ${office.phoneDisplay}`];
}

function getSingleLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ").trim();
}

function getHtmlParagraphs(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${getEscapedHtml(paragraph.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function getDetailLines(summary: RequestSummary): string[] {
  return [
    `From: ${getSingleLine(summary.contactName)}`,
    summary.contactEmail ? `Email: ${summary.contactEmail}` : null,
    summary.contactPhone ? `Phone: ${summary.contactPhone}` : null,
    `Came from: ${SOURCE_LABELS[summary.source] ?? summary.source}`,
  ].filter((line): line is string => line !== null);
}

export function getNewRequestAlert(summary: RequestSummary, recipient: string): OutgoingEmail {
  const kind = SOURCE_LABELS[summary.source] ?? "Request";
  const details = getDetailLines(summary);
  return {
    to: { email: recipient },
    subject: `New ${kind.toLowerCase()} from ${getSingleLine(summary.contactName)}`,
    text: [...details, "", summary.message, "", `Open it in the inbox: ${summary.threadUrl}`].join("\n"),
    html: getBrandedEmailHtml({
      preheader: `${kind} — open it in the inbox`,
      heading: "New website request",
      bodyHtml: `<p>${details.map(getEscapedHtml).join("<br>")}</p>${getHtmlParagraphs(summary.message)}`,
      button: { label: "Open it in the inbox", url: summary.threadUrl },
      footerLines: STAFF_FOOTER_LINES,
      siteUrl: summary.siteUrl,
    }),
  };
}

const SAFE_FIRST_NAME = /^[\p{L}'-]{1,30}$/u;

/** A short, plain first name for greetings; anything unusual becomes "there". */
export function getSafeFirstName(name: string): string {
  const firstWord = name.trim().split(/\s+/)[0] ?? "";
  return SAFE_FIRST_NAME.test(firstWord) ? firstWord : "there";
}

// The confirmation never repeats what the visitor typed, so the form cannot be used to
// send someone else a message from CWR's address.
type VisitorEmailInput = { name: string; email: string; office: OfficeContact; siteUrl?: string };

export function getVisitorCopy({ name, email, office, siteUrl }: VisitorEmailInput): OutgoingEmail {
  const greeting = `Hi ${getSafeFirstName(name)},`;
  const body = `Thanks for contacting ${FIRM_NAME}. We got your message and will reply ${REPLY_PROMISE}. If it's urgent, call or text ${office.phoneDisplay}.`;
  return {
    to: { email },
    replyTo: { email: office.email, name: FIRM_NAME },
    subject: `We got your message — ${FIRM_NAME}`,
    text: [greeting, "", body].join("\n"),
    html: getBrandedEmailHtml({
      preheader: `We'll reply ${REPLY_PROMISE}.`,
      heading: "We got your message",
      bodyHtml: `<p>${getEscapedHtml(greeting)}</p><p>${getEscapedHtml(body)}</p>`,
      footerLines: getVisitorFooterLines(office),
      siteUrl,
    }),
  };
}

export function getReplyEmail({ name, email, reply, office, siteUrl }: VisitorEmailInput & { reply: string }): OutgoingEmail {
  const footer = `${FIRM_NAME} · ${office.phoneDisplay} · Reply to this email to answer.`;
  return {
    to: { email, name: getSingleLine(name) },
    replyTo: { email: office.email, name: FIRM_NAME },
    subject: `Re: your message to ${FIRM_NAME}`,
    text: [reply, "", "—", footer].join("\n"),
    html: getBrandedEmailHtml({
      preheader: "Reply to this email to answer.",
      heading: `A reply from ${FIRM_NAME}`,
      bodyHtml: `${getHtmlParagraphs(reply)}<p>—<br>${getEscapedHtml(footer)}</p>`,
      footerLines: getVisitorFooterLines(office),
      siteUrl,
    }),
  };
}

export function getTestAlert(recipient: string, siteUrl?: string): OutgoingEmail {
  const body = "This is a test alert from the CWR website. If you can read this, new requests will reach you.";
  const html = getBrandedEmailHtml({ preheader: "New requests will reach you.", heading: "Test alert", bodyHtml: `<p>${getEscapedHtml(body)}</p>`, footerLines: STAFF_FOOTER_LINES, siteUrl });
  return { to: { email: recipient }, subject: "Test alert from the CWR website", text: body, html };
}

export type ProblemDigestGroup = {
  section: string;
  label: string;
  severity: "info" | "warning" | "error" | "critical";
  count: number;
  last_seen_at: string;
  reference: string | null;
};

const PROBLEM_SEVERITY_LABELS: Record<ProblemDigestGroup["severity"], string> = { critical: "Urgent", error: "Problem", warning: "Warning", info: "Note" };

function getEasternTime(isoTime: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(isoTime));
}

function getProblemLine(group: ProblemDigestGroup): string {
  const times = group.count === 1 ? "once" : `${group.count} times`;
  const reference = group.reference ? ` Reference: ${group.reference}.` : "";
  return `${PROBLEM_SEVERITY_LABELS[group.severity]} — ${group.section}: ${group.label}. Happened ${times}, most recently ${getEasternTime(group.last_seen_at)}.${reference}`;
}

/**
 * The problem-alert digest (docs/cwr-error-tracking-plan.md). Built only from catalog labels,
 * counts, times, and reference codes — never text anyone typed — so no personal data or
 * attacker-chosen words reach the inbox.
 */
type ProblemDigestInput = { groups: ProblemDigestGroup[]; recipient: string; adminUrl: string; siteUrl?: string };

export function getProblemDigest({ groups, recipient, adminUrl, siteUrl }: ProblemDigestInput): OutgoingEmail {
  const isUrgent = groups.some((group) => group.severity === "critical");
  const lines = groups.map(getProblemLine);
  const intro = "Something on the CWR website isn't working as it should. These are problems people ran into in the admin portal:";
  const footer = "Quote a reference code to your developer to find the details. The admin portal:";
  return {
    to: { email: recipient },
    subject: `${isUrgent ? "Urgent: " : ""}CWR website problem${groups.length === 1 ? "" : "s"} need attention`,
    text: [intro, "", ...lines, "", `${footer} ${adminUrl}`].join("\n"),
    html: getBrandedEmailHtml({
      preheader: "Quote a reference code to your developer to find the details.",
      heading: `${isUrgent ? "Urgent: " : ""}Website problems need attention`,
      bodyHtml: `<p>${getEscapedHtml(intro)}</p><ul>${lines.map((line) => `<li>${getEscapedHtml(line)}</li>`).join("")}</ul><p>${getEscapedHtml(footer)} <a href="${getEscapedHtml(adminUrl)}">${getEscapedHtml(adminUrl)}</a></p>`,
      footerLines: STAFF_FOOTER_LINES,
      siteUrl,
    }),
  };
}

// ---------------------------------------------------------------------------
// Account emails: everything Supabase Auth can ask for (13 templates, 14 action types).
// The email-worker fills in real values; the same functions, filled with Supabase's own
// {{ .Name }} placeholders, make supabase/templates/*.html — the fallback Supabase uses only
// if the Send Email hook is ever switched off. Sign-up, sign-in link, email change and
// verification code have no working link: the site doesn't offer those flows.
// ---------------------------------------------------------------------------

export type AccountEmailKind = "template" | "notification";

export type AccountEmailValues = {
  /** Where links go: the address that serves the new site. */
  siteUrl: string;
  /** The one-time link value, already URL-safe (invite and reset only). */
  tokenHash: string;
  email: string;
  newEmail: string;
  oldEmail: string;
};

type AccountEmailContent = {
  type: string;
  kind: AccountEmailKind;
  subject: string;
  /** The Supabase placeholders the fallback file may use (anything else fails its test). */
  allowedVariables: string[];
  preheader: string;
  heading: string;
  getParagraphs: (values: AccountEmailValues) => string[];
  getButton?: (values: AccountEmailValues) => EmailButton;
};

export type AuthEmailTemplate = { type: string; kind: AccountEmailKind; fileName: string; subject: string; allowedVariables: string[]; html: string };

const ACCOUNT_FOOTER_LINES = [FIRM_NAME];
const CONTACT_US = `If you didn't expect this, contact ${FIRM_NAME} right away.`;
const IGNORE_IT = "If you didn't ask for this, you can ignore this email — nothing has changed.";
const PASSWORD_ONLY = "The website signs in with your email and password only";
const LINK_VARIABLES = ["{{ .SiteURL }}", "{{ .TokenHash }}"];
const SITE_VARIABLES = ["{{ .SiteURL }}"];
const SUPABASE_PLACEHOLDERS: AccountEmailValues = {
  siteUrl: "{{ .SiteURL }}",
  tokenHash: "{{ .TokenHash }}",
  email: "{{ .Email }}",
  newEmail: "{{ .NewEmail }}",
  oldEmail: "{{ .OldEmail }}",
};

function getConfirmLink({ siteUrl, tokenHash }: AccountEmailValues, type: "invite" | "recovery"): string {
  return `${siteUrl}/admin/auth/confirm?token_hash=${tokenHash}&type=${type}`;
}

function getSignInLink({ siteUrl }: AccountEmailValues): string {
  return `${siteUrl}/admin/login`;
}

function getForgotPasswordLink({ siteUrl }: AccountEmailValues): string {
  return `${siteUrl}/admin/forgot-password`;
}

const ACCOUNT_EMAILS: AccountEmailContent[] = [
  {
    type: "invite",
    kind: "template",
    subject: "Your invite to the CWR admin portal",
    allowedVariables: LINK_VARIABLES,
    preheader: "Accept your invite and set your password.",
    heading: "You're invited to the CWR admin portal",
    getParagraphs: () => [
      "Charlie Ward Realty has given you access to update the website.",
      "This link works once and expires in 24 hours. After you set a password, you'll sign in with your email and that password.",
      "If you weren't expecting this, you can ignore this email.",
    ],
    getButton: (values) => ({ label: "Accept the invite and set your password", url: getConfirmLink(values, "invite") }),
  },
  {
    type: "recovery",
    kind: "template",
    subject: "Reset your CWR admin password",
    allowedVariables: LINK_VARIABLES,
    preheader: "This link works once and expires in one hour.",
    heading: "Reset your CWR admin password",
    getParagraphs: () => [
      "Someone asked to reset the password for this admin account.",
      "This link works once and expires in one hour. If you didn't ask for this, you can ignore this email — your password won't change.",
    ],
    getButton: (values) => ({ label: "Choose a new password", url: getConfirmLink(values, "recovery") }),
  },
  {
    type: "confirmation",
    kind: "template",
    subject: "CWR admin portal: no sign-up needed",
    allowedVariables: [],
    preheader: "New admins are invited by the owner.",
    heading: "Sign-up isn't used on the CWR admin portal",
    getParagraphs: () => [
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
    getParagraphs: () => [
      `Someone asked for a sign-in link for this email address. ${PASSWORD_ONLY} so there's no link in this email.`,
      `Forgot your password? Use "Forgot password" on the sign-in page. ${IGNORE_IT}`,
    ],
    getButton: (values) => ({ label: "Go to the sign-in page", url: getSignInLink(values) }),
  },
  {
    type: "email_change",
    kind: "template",
    subject: "Email change request for your CWR admin account",
    allowedVariables: ["{{ .NewEmail }}"],
    preheader: "Nothing was changed.",
    heading: "Email changes aren't made this way",
    getParagraphs: ({ newEmail }) => [
      `Someone asked to change the email address on this CWR admin account to ${newEmail}. The website doesn't change email addresses this way, so nothing was changed and there's no link in this email.`,
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
    getParagraphs: () => [
      `Someone signed in to your CWR admin account asked for a verification code. ${PASSWORD_ONLY} so no code is included.`,
      `If this wasn't you, reset your password right away and contact ${FIRM_NAME}.`,
    ],
    getButton: (values) => ({ label: "Reset your password", url: getForgotPasswordLink(values) }),
  },
  {
    type: "password_changed",
    kind: "notification",
    subject: "Your CWR admin password was set or changed",
    allowedVariables: ["{{ .SiteURL }}", "{{ .Email }}"],
    preheader: "If this was you, there's nothing to do.",
    heading: "Your password was set or changed",
    getParagraphs: ({ email }) => [
      `The password for ${email} on the CWR admin portal was just set or changed.`,
      "If this was you — for example after accepting an invite or resetting your password — you don't need to do anything.",
      `If it wasn't you, reset your password right away and contact ${FIRM_NAME}.`,
    ],
    getButton: (values) => ({ label: "Reset your password", url: getForgotPasswordLink(values) }),
  },
  {
    type: "email_changed",
    kind: "notification",
    subject: "The email on your CWR admin account changed",
    allowedVariables: ["{{ .OldEmail }}", "{{ .Email }}"],
    preheader: "Your sign-in email address is different now.",
    heading: "Your sign-in email changed",
    getParagraphs: ({ email, oldEmail }) => [`The sign-in email for your CWR admin account changed from ${oldEmail} to ${email}.`, CONTACT_US],
  },
  {
    type: "phone_changed",
    kind: "notification",
    subject: "The phone number on your CWR admin account changed",
    allowedVariables: [],
    preheader: "Phone numbers aren't used to sign in.",
    heading: "Your account phone number changed",
    getParagraphs: () => [`The phone number on your CWR admin account changed. ${PASSWORD_ONLY}.`, CONTACT_US],
  },
  {
    type: "identity_linked",
    kind: "notification",
    subject: "A sign-in method was added to your CWR admin account",
    allowedVariables: [],
    preheader: "Check that this was you.",
    heading: "A sign-in method was added",
    getParagraphs: () => [`A new sign-in method was added to your CWR admin account. ${PASSWORD_ONLY}.`, CONTACT_US],
  },
  {
    type: "identity_unlinked",
    kind: "notification",
    subject: "A sign-in method was removed from your CWR admin account",
    allowedVariables: [],
    preheader: "Check that this was you.",
    heading: "A sign-in method was removed",
    getParagraphs: () => [`A sign-in method was removed from your CWR admin account. ${PASSWORD_ONLY}.`, CONTACT_US],
  },
  {
    type: "mfa_factor_enrolled",
    kind: "notification",
    subject: "A sign-in code method was added to your CWR admin account",
    allowedVariables: [],
    preheader: "Check that this was you.",
    heading: "A sign-in code method was added",
    getParagraphs: () => [`A sign-in code method was added to your CWR admin account. ${PASSWORD_ONLY} so it isn't needed.`, CONTACT_US],
  },
  {
    type: "mfa_factor_unenrolled",
    kind: "notification",
    subject: "A sign-in code method was removed from your CWR admin account",
    allowedVariables: [],
    preheader: "This is expected — sign-in codes are no longer used.",
    heading: "A sign-in code method was removed",
    getParagraphs: () => [
      `A sign-in code method was removed from your CWR admin account. ${PASSWORD_ONLY} so old codes are being cleaned up and you don't need to do anything.`,
      `If you have questions, contact ${FIRM_NAME}.`,
    ],
  },
];

// Supabase's 14 action types → our 13 templates ("email" is the sign-in code variant of a magic link).
const ACTION_TYPE_TEMPLATES: Record<string, string> = {
  signup: "confirmation",
  invite: "invite",
  magiclink: "magic_link",
  email: "magic_link",
  recovery: "recovery",
  email_change: "email_change",
  reauthentication: "reauthentication",
  password_changed_notification: "password_changed",
  email_changed_notification: "email_changed",
  phone_changed_notification: "phone_changed",
  identity_linked_notification: "identity_linked",
  identity_unlinked_notification: "identity_unlinked",
  mfa_factor_enrolled_notification: "mfa_factor_enrolled",
  mfa_factor_unenrolled_notification: "mfa_factor_unenrolled",
};

export const SUPABASE_ACTION_TYPES = Object.keys(ACTION_TYPE_TEMPLATES);

function getAccountContent(type: string): AccountEmailContent | null {
  return ACCOUNT_EMAILS.find((content) => content.type === type) ?? null;
}

function getAccountHtml(content: AccountEmailContent, { values, layoutSiteUrl }: { values: AccountEmailValues; layoutSiteUrl?: string }): string {
  const bodyHtml = content.getParagraphs(values).map((paragraph) => `<p>${getEscapedHtml(paragraph)}</p>`).join("");
  const button = content.getButton?.(values);
  return getBrandedEmailHtml({ preheader: content.preheader, heading: content.heading, bodyHtml, button, footerLines: ACCOUNT_FOOTER_LINES, siteUrl: layoutSiteUrl });
}

function getAccountText(content: AccountEmailContent, values: AccountEmailValues): string {
  const button = content.getButton?.(values);
  return [...content.getParagraphs(values), ...(button ? [`${button.label}: ${button.url}`] : []), "—", FIRM_NAME].join("\n\n");
}

/** The account email for one Supabase action type, or null for a type Supabase doesn't send. */
export function getAccountEmail({ actionType, recipient, values }: { actionType: string; recipient: string; values: AccountEmailValues }): OutgoingEmail | null {
  const content = getAccountContent(ACTION_TYPE_TEMPLATES[actionType] ?? "");
  if (!content) return null;
  return { to: { email: recipient }, subject: content.subject, text: getAccountText(content, values), html: getAccountHtml(content, { values, layoutSiteUrl: values.siteUrl }) };
}

function getFallbackFileName({ type, kind }: AccountEmailContent): string {
  return kind === "notification" ? `${type}_notification.html` : `${type}.html`;
}

/** The 13 Supabase fallback templates, filled with Supabase's placeholders (logo from the live site). */
export function getAuthEmailTemplates(): AuthEmailTemplate[] {
  return ACCOUNT_EMAILS.map((content) => ({
    type: content.type,
    kind: content.kind,
    fileName: getFallbackFileName(content),
    subject: content.subject,
    allowedVariables: content.allowedVariables,
    html: `${getAccountHtml(content, { values: SUPABASE_PLACEHOLDERS })}\n`,
  }));
}
