// The emails the site sends (Admin §5, Features §2). Every value is escaped for HTML and
// stripped of line breaks where it lands in a subject, so visitor input cannot change
// the message structure.

import type { OutgoingEmail } from "@/lib/email/mailersend";
import { REPLY_PROMISE } from "@/lib/site/reply-promise";

const FIRM_NAME = "Charlie Ward Realty";

const SOURCE_LABELS: Record<string, string> = { contact: "Contact form", booking: "CWR TouchUp request", chat_handoff: "Chat assistant handoff" };

export type RequestSummary = {
  threadUrl: string;
  source: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  subject: string;
  message: string;
};

export type OfficeContact = { phoneDisplay: string; email: string };

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function getEscapedHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
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
    html: `<p>${details.map(getEscapedHtml).join("<br>")}</p>${getHtmlParagraphs(summary.message)}<p><a href="${getEscapedHtml(summary.threadUrl)}">Open it in the inbox</a></p>`,
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
export function getVisitorCopy({ name, email, office }: { name: string; email: string; office: OfficeContact }): OutgoingEmail {
  const greeting = `Hi ${getSafeFirstName(name)},`;
  const body = `Thanks for contacting ${FIRM_NAME}. We got your message and will reply ${REPLY_PROMISE}. If it's urgent, call or text ${office.phoneDisplay}.`;
  return {
    to: { email },
    replyTo: { email: office.email, name: FIRM_NAME },
    subject: `We got your message — ${FIRM_NAME}`,
    text: [greeting, "", body].join("\n"),
    html: `<p>${getEscapedHtml(greeting)}</p><p>${getEscapedHtml(body)}</p>`,
  };
}

export function getReplyEmail({ name, email, reply, office }: { name: string; email: string; reply: string; office: OfficeContact }): OutgoingEmail {
  const footer = `${FIRM_NAME} · ${office.phoneDisplay} · Reply to this email to answer.`;
  return {
    to: { email, name: getSingleLine(name) },
    replyTo: { email: office.email, name: FIRM_NAME },
    subject: `Re: your message to ${FIRM_NAME}`,
    text: [reply, "", "—", footer].join("\n"),
    html: `${getHtmlParagraphs(reply)}<p>—<br>${getEscapedHtml(footer)}</p>`,
  };
}

export function getTestAlert(recipient: string): OutgoingEmail {
  const body = "This is a test alert from the CWR website. If you can read this, new requests will reach you.";
  return { to: { email: recipient }, subject: "Test alert from the CWR website", text: body, html: `<p>${getEscapedHtml(body)}</p>` };
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
export function getProblemDigest({ groups, recipient, adminUrl }: { groups: ProblemDigestGroup[]; recipient: string; adminUrl: string }): OutgoingEmail {
  const isUrgent = groups.some((group) => group.severity === "critical");
  const lines = groups.map(getProblemLine);
  const intro = "Something on the CWR website isn't working as it should. These are problems people ran into in the admin portal:";
  const footer = "Quote a reference code to your developer to find the details. The admin portal:";
  return {
    to: { email: recipient },
    subject: `${isUrgent ? "Urgent: " : ""}CWR website problem${groups.length === 1 ? "" : "s"} need attention`,
    text: [intro, "", ...lines, "", `${footer} ${adminUrl}`].join("\n"),
    html: `<p>${getEscapedHtml(intro)}</p><ul>${lines.map((line) => `<li>${getEscapedHtml(line)}</li>`).join("")}</ul><p>${getEscapedHtml(footer)} <a href="${getEscapedHtml(adminUrl)}">${getEscapedHtml(adminUrl)}</a></p>`,
  };
}
