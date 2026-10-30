import { sendWithMailerSend, type EmailAddress, type OutgoingEmail } from "./mailersend.ts";

// Chooses how to send. Each runner passes its own settings (the site from process.env, the
// email-worker from Deno.env). Without MailerSend settings nothing is sent and the delivery
// log says so — never a silent success. Local runs send to Mailpit, Supabase's test inbox.

export type SendOutcome = { status: "sent"; providerMessageId: string | null } | { status: "not_sent"; reason: string };

export type EmailSender = (email: OutgoingEmail) => Promise<SendOutcome>;

export type EmailTransport = "mailersend" | "mailpit" | "log";

export type EmailSettings = {
  transport: EmailTransport;
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
  /** Mailpit's address, for local runs only. */
  mailpitUrl?: string;
};

const DEFAULT_FROM_NAME = "CWR website";
const NOT_SET_UP_REASON = "Email sending is not set up yet";
const LOG_ONLY_REASON = "Test run: the email was logged, not sent";

class MailpitSendError extends Error {
  constructor(readonly context: { status: number }) {
    super(`Mailpit answered ${context.status}`);
    this.name = "MailpitSendError";
  }
}

function getFromAddress({ fromEmail, fromName }: EmailSettings): EmailAddress | null {
  return fromEmail ? { email: fromEmail, name: fromName || DEFAULT_FROM_NAME } : null;
}

function getMailpitAddress({ email, name }: EmailAddress) {
  return { Email: email, Name: name ?? "" };
}

async function sendWithMailpit(email: OutgoingEmail, { mailpitUrl, from }: { mailpitUrl: string; from: EmailAddress }): Promise<string | null> {
  const response = await fetch(`${mailpitUrl}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: getMailpitAddress(from),
      To: [getMailpitAddress(email.to)],
      Subject: email.subject,
      Text: email.text,
      HTML: email.html,
      ...(email.replyTo ? { ReplyTo: [getMailpitAddress(email.replyTo)] } : {}),
    }),
  });
  if (!response.ok) throw new MailpitSendError({ status: response.status });
  const { ID: id } = (await response.json()) as { ID?: string };
  return id ?? null;
}

export function isEmailConfigured(settings: EmailSettings): boolean {
  if (settings.transport === "log") return true;
  if (settings.transport === "mailpit") return Boolean(settings.mailpitUrl && settings.fromEmail);
  return Boolean(settings.apiKey && settings.fromEmail);
}

export function getEmailSender(settings: EmailSettings): EmailSender {
  const from = getFromAddress(settings);
  if (settings.transport === "log") return () => Promise.resolve({ status: "not_sent", reason: LOG_ONLY_REASON });
  if (!isEmailConfigured(settings) || !from) return () => Promise.resolve({ status: "not_sent", reason: NOT_SET_UP_REASON });
  if (settings.transport === "mailpit") return async (email) => ({ status: "sent", providerMessageId: await sendWithMailpit(email, { mailpitUrl: settings.mailpitUrl ?? "", from }) });
  return async (email) => ({ status: "sent", providerMessageId: await sendWithMailerSend(email, { apiKey: settings.apiKey ?? "", from }) });
}
