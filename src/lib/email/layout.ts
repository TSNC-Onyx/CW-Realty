// The shared Charlie Ward Realty email layout (docs/cwr-branded-email-templates-plan.md, look A).
// Email-safe on purpose: tables, inline styles, no HTML comments or Outlook-only code (Supabase
// strips them), and the <style> block is only an extra for Apple Mail dark mode and phones.

import { EMAIL_COLORS } from "@/lib/email/brand-colors";
import { SITE_URL } from "@/lib/site/navigation";

export const FIRM_NAME = "Charlie Ward Realty";
const LOGO_URL = `${SITE_URL}/brand/cwr-logo-email.png`;
const LOGO_ALT = "CWR Real Estate";
const LOGO_SIZE_PX = 56;
const MAX_WIDTH_PX = 600;
const SITE_LABEL = new URL(SITE_URL).hostname.replace(/^www\./, "");
const HEADING_FONT = "Georgia, 'Times New Roman', serif";
const BODY_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
// Button links may only go to the live site or, in Supabase sign-in templates, its link variable.
const ALLOWED_URL_PREFIXES = ["https://", "{{ .SiteURL }}/"];
const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export type EmailButton = { label: string; url: string };

export type BrandedEmail = {
  /** Fixed preview text shown after the subject in the inbox list. */
  preheader: string;
  /** Fixed heading text; never visitor input. */
  heading: string;
  /** Message body, already escaped by the caller. */
  bodyHtml: string;
  button?: EmailButton;
  /** Plain text; escaped here. */
  footerLines: string[];
};

export class EmailLayoutError extends Error {
  constructor(message: string, readonly context: { url: string }) {
    super(message);
    this.name = "EmailLayoutError";
  }
}

export function getEscapedHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function getCheckedUrl(url: string): string {
  const isAllowed = ALLOWED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
  if (!isAllowed) throw new EmailLayoutError("Email button links must use https", { url });
  return url;
}

function getHead(heading: string): string {
  return `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${getEscapedHtml(heading)}</title><style>@media (prefers-color-scheme: dark){.cwr-page{background-color:${EMAIL_COLORS.dark} !important}.cwr-card,.cwr-card h1{background-color:${EMAIL_COLORS["dark-alt"]} !important;color:${EMAIL_COLORS["on-dark"]} !important}.cwr-card a:not(.cwr-button-link){color:${EMAIL_COLORS.gold} !important}.cwr-footer,.cwr-footer a{color:${EMAIL_COLORS["on-dark-muted"]} !important}}@media (max-width:480px){.cwr-card{padding:24px 20px !important}.cwr-button{width:100% !important}.cwr-button-link{display:block !important;text-align:center !important}}</style></head>`;
}

function getPreheader(preheader: string): string {
  return `<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;opacity:0;font-size:1px;line-height:1px;color:${EMAIL_COLORS.page};">${getEscapedHtml(preheader)}</div>`;
}

function getHeaderRow(): string {
  const logo = `<img src="${LOGO_URL}" width="${LOGO_SIZE_PX}" height="${LOGO_SIZE_PX}" alt="${LOGO_ALT}" style="display:block;border:0;width:${LOGO_SIZE_PX}px;height:${LOGO_SIZE_PX}px;font-family:${BODY_FONT};font-size:14px;line-height:1.2;color:${EMAIL_COLORS["on-dark"]};">`;
  const name = `<td style="padding:4px 0;vertical-align:middle;font-family:${HEADING_FONT};font-size:22px;line-height:1.3;color:${EMAIL_COLORS["on-dark"]};">${FIRM_NAME}</td>`;
  return `<tr><td align="center" bgcolor="${EMAIL_COLORS.dark}" style="background-color:${EMAIL_COLORS.dark};padding:20px 24px;"><table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:4px 14px 4px 0;vertical-align:middle;">${logo}</td>${name}</tr></table></td></tr>`;
}

function getButton(button: EmailButton): string {
  const link = `<a class="cwr-button-link" href="${getEscapedHtml(getCheckedUrl(button.url))}" style="display:inline-block;padding:14px 24px;font-family:${BODY_FONT};font-size:16px;font-weight:bold;line-height:20px;color:${EMAIL_COLORS.ink};text-decoration:none;">${getEscapedHtml(button.label)}</a>`;
  return `<table role="presentation" class="cwr-button" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr><td bgcolor="${EMAIL_COLORS.gold}" style="background-color:${EMAIL_COLORS.gold};mso-padding-alt:14px 24px;">${link}</td></tr></table>`;
}

function getCardRow({ heading, bodyHtml, button }: BrandedEmail): string {
  const title = `<h1 style="margin:0 0 16px;font-family:${HEADING_FONT};font-size:26px;line-height:1.25;font-weight:normal;color:${EMAIL_COLORS.ink};">${getEscapedHtml(heading)}</h1>`;
  return `<tr><td class="cwr-card" bgcolor="${EMAIL_COLORS.surface}" style="background-color:${EMAIL_COLORS.surface};border-top:4px solid ${EMAIL_COLORS.gold};padding:32px;font-family:${BODY_FONT};font-size:16px;line-height:1.5;color:${EMAIL_COLORS.ink};">${title}${bodyHtml}${button ? getButton(button) : ""}</td></tr>`;
}

function getFooterRow(footerLines: string[]): string {
  const lines = footerLines.map((line) => `${getEscapedHtml(line)}<br>`).join("");
  const siteLink = `<a href="${SITE_URL}" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">${SITE_LABEL}</a>`;
  return `<tr><td class="cwr-footer" align="center" style="padding:20px 24px;font-family:${BODY_FONT};font-size:14px;line-height:1.5;color:${EMAIL_COLORS.muted};">${lines}${siteLink}</td></tr>`;
}

/** Wraps an email body in the branded layout and returns the complete HTML document. */
export function getBrandedEmailHtml(email: BrandedEmail): string {
  const content = `${getHeaderRow()}${getCardRow(email)}${getFooterRow(email.footerLines)}`;
  const container = `<table role="presentation" width="${MAX_WIDTH_PX}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${MAX_WIDTH_PX}px;">${content}</table>`;
  const page = `<table role="presentation" class="cwr-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLORS.page}" style="background-color:${EMAIL_COLORS.page};"><tr><td align="center" style="padding:24px 12px;">${container}</td></tr></table>`;
  return `<!doctype html><html lang="en">${getHead(email.heading)}<body class="cwr-page" style="margin:0;padding:0;background-color:${EMAIL_COLORS.page};">${getPreheader(email.preheader)}${page}</body></html>`;
}
