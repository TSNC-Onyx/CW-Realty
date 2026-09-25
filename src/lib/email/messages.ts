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
