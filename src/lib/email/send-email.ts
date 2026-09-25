import { sendWithMailerSend, type EmailAddress, type OutgoingEmail } from "@/lib/email/mailersend";

// Chooses how to send. Without MailerSend settings (local development, CI) nothing is sent
// and the delivery log says so — never a silent success.

export type SendOutcome = { status: "sent"; providerMessageId: string | null } | { status: "not_sent"; reason: string };

export type EmailSender = (email: OutgoingEmail) => Promise<SendOutcome>;

const DEFAULT_FROM_NAME = "CWR website";

function getFromAddress(): EmailAddress | null {
  const email = process.env.ALERT_FROM_EMAIL;
  return email ? { email, name: process.env.ALERT_FROM_NAME || DEFAULT_FROM_NAME } : null;
}

export function getEmailSender(): EmailSender {
  const apiKey = process.env.MAILERSEND_API_KEY;
  const from = getFromAddress();
  if (!apiKey || !from) return async () => ({ status: "not_sent", reason: "Email sending is not set up yet" });
  return async (email) => ({ status: "sent", providerMessageId: await sendWithMailerSend(email, { apiKey, from }) });
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.MAILERSEND_API_KEY && process.env.ALERT_FROM_EMAIL);
}
