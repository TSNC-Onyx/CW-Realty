// 623 Summit's password-reset and invite emails (docs/runbooks/summit-shared-database.md).
// 623 Summit is a separate site that shares this project's sign-in system, so Supabase sends its
// emails from the same fallback templates. Each 623 version sits beside the CWR one and is chosen
// by the address the 623 owner page asks Supabase to return to. CWR's own emails are untouched:
// the CWR branch is the exact HTML it was before (email-files.test.ts).
// Owner choice 2026-10-22: 623 emails carry 623 branding, an exception to Style §Emails, which
// covers the CWR site's own emails.

import { SUMMIT_EMAIL_COLORS as SUMMIT_COLORS } from "./brand-colors.ts";
import { getEscapedHtml } from "./layout.ts";

// Where the 623 owner page asks reset and invite links to return to: the live page as Cloudflare
// Pages serves it (/admin), the same page by its file name, and the local test server.
const SUMMIT_RETURN_ADDRESSES = ["https://623summit.pages.dev/admin", "https://623summit.pages.dev/admin.html", "http://localhost:8623/admin"];
const SUMMIT_SITE_URL = "https://623summit.pages.dev";
const SUMMIT_NAME = "623 Summit Avenue";
const HEADING_FONT = "Georgia, 'Times New Roman', serif";
const BODY_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MAX_WIDTH_PX = 600;
// Supabase builds this link itself: it verifies the token, then returns to the 623 page with the
// session after the #, which is what the 623 page reads.
const CONFIRMATION_URL = "{{ .ConfirmationURL }}";

export type SummitAccountType = "invite" | "recovery";

type SummitAccountContent = { subject: string; preheader: string; heading: string; paragraphs: string[]; buttonLabel: string };

const SUMMIT_ACCOUNT_EMAILS: Record<SummitAccountType, SummitAccountContent> = {
  invite: {
    subject: "Your invite to the 623 Summit owner console",
    preheader: "Accept your invite and choose your password.",
    heading: "You're invited to the 623 Summit owner console",
    paragraphs: [
      "An owner of 623 Summit Avenue has given you access to the reservations console.",
      "This link works once and expires in 24 hours. After you choose a password, you'll sign in with your email and that password.",
      "If you weren't expecting this, you can ignore this email.",
    ],
    buttonLabel: "Accept the invite and choose a password",
  },
  recovery: {
    subject: "Reset your 623 Summit owner password",
    preheader: "This link works once and expires in one hour.",
    heading: "Reset your 623 Summit owner password",
    paragraphs: [
      "Someone asked to reset the password for this owner account.",
      "This link works once and expires in one hour. If you didn't ask for this, you can ignore this email — your password won't change.",
    ],
    buttonLabel: "Choose a new password",
  },
};

/** The Supabase placeholders a 623 branch adds to a fallback template. */
export const SUMMIT_TEMPLATE_VARIABLES = [getSiteCondition(), "{{ else }}", "{{ end }}", CONFIRMATION_URL];

export function isSummitAccountType(type: string): type is SummitAccountType {
  return type in SUMMIT_ACCOUNT_EMAILS;
}

/** Text that Supabase renders as the 623 version for 623 requests and the CWR version otherwise. */
export function getChosenBySite({ summit, cwr }: { summit: string; cwr: string }): string {
  return `${getSiteCondition()}${summit}{{ else }}${cwr}{{ end }}`;
}

export function getSummitSubject(type: SummitAccountType): string {
  return SUMMIT_ACCOUNT_EMAILS[type].subject;
}

/** The complete 623-branded fallback email, with Supabase's link placeholder. */
export function getSummitAccountHtml(type: SummitAccountType): string {
  const content = SUMMIT_ACCOUNT_EMAILS[type];
  const body = content.paragraphs.map((paragraph) => `<p>${getEscapedHtml(paragraph)}</p>`).join("");
  const rows = `${getHeaderRow()}${getCardRow({ heading: content.heading, body, buttonLabel: content.buttonLabel })}${getFooterRow()}`;
  const container = `<table role="presentation" width="${MAX_WIDTH_PX}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${MAX_WIDTH_PX}px;">${rows}</table>`;
  const page = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SUMMIT_COLORS.page}" style="background-color:${SUMMIT_COLORS.page};"><tr><td align="center" style="padding:24px 12px;">${container}</td></tr></table>`;
  return `<!doctype html><html lang="en">${getHead(content.heading)}<body style="margin:0;padding:0;background-color:${SUMMIT_COLORS.page};">${getPreheader(content.preheader)}${page}</body></html>`;
}

// Go template raw strings (backticks) keep the condition free of double quotes, so it can sit
// inside a quoted subject in config.toml unchanged.
function getSiteCondition(): string {
  return `{{ if eq .RedirectTo ${SUMMIT_RETURN_ADDRESSES.map((address) => `\`${address}\``).join(" ")} }}`;
}

function getHead(heading: string): string {
  return `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${getEscapedHtml(heading)}</title><style>@media (max-width:480px){.summit-card{padding:24px 20px !important}.summit-button{width:100% !important}.summit-button-link{display:block !important;text-align:center !important}}</style></head>`;
}

function getPreheader(preheader: string): string {
  return `<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;opacity:0;font-size:1px;line-height:1px;color:${SUMMIT_COLORS.page};">${getEscapedHtml(preheader)}</div>`;
}

function getHeaderRow(): string {
  return `<tr><td align="center" bgcolor="${SUMMIT_COLORS.header}" style="background-color:${SUMMIT_COLORS.header};padding:24px;font-family:${HEADING_FONT};font-size:24px;line-height:1.3;letter-spacing:1px;color:${SUMMIT_COLORS.onHeader};">${SUMMIT_NAME}</td></tr>`;
}

function getCardRow({ heading, body, buttonLabel }: { heading: string; body: string; buttonLabel: string }): string {
  const title = `<h1 style="margin:0 0 16px;font-family:${HEADING_FONT};font-size:26px;line-height:1.25;font-weight:normal;color:${SUMMIT_COLORS.ink};">${getEscapedHtml(heading)}</h1>`;
  const link = `<a class="summit-button-link" href="${CONFIRMATION_URL}" style="display:inline-block;padding:14px 24px;font-family:${BODY_FONT};font-size:16px;font-weight:bold;line-height:20px;color:${SUMMIT_COLORS.ink};text-decoration:none;">${getEscapedHtml(buttonLabel)}</a>`;
  const button = `<table role="presentation" class="summit-button" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr><td bgcolor="${SUMMIT_COLORS.gold}" style="background-color:${SUMMIT_COLORS.gold};mso-padding-alt:14px 24px;">${link}</td></tr></table>`;
  return `<tr><td class="summit-card" bgcolor="${SUMMIT_COLORS.surface}" style="background-color:${SUMMIT_COLORS.surface};border-top:4px solid ${SUMMIT_COLORS.gold};padding:32px;font-family:${BODY_FONT};font-size:16px;line-height:1.5;color:${SUMMIT_COLORS.ink};">${title}${body}${button}</td></tr>`;
}

function getFooterRow(): string {
  const siteLink = `<a href="${SUMMIT_SITE_URL}" style="color:${SUMMIT_COLORS.muted};text-decoration:underline;">623summit.pages.dev</a>`;
  return `<tr><td align="center" style="padding:20px 24px;font-family:${BODY_FONT};font-size:14px;line-height:1.5;color:${SUMMIT_COLORS.muted};">${SUMMIT_NAME}<br>${siteLink}</td></tr>`;
}
