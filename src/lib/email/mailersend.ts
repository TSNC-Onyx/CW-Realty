// MailerSend REST API (owner-approved email provider). Plain fetch keeps this usable from
// both the Next.js server and the queue consumer Worker.

const MAILERSEND_URL = "https://api.mailersend.com/v1/email";
const ACCEPTED = 202;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;
const MAX_ERROR_LENGTH = 500;

export type EmailAddress = { email: string; name?: string };

export type OutgoingEmail = {
  to: EmailAddress;
  subject: string;
  text: string;
  html: string;
  replyTo?: EmailAddress;
};

export type MailerSendSettings = { apiKey: string; from: EmailAddress };

export class EmailSendError extends Error {
  constructor(message: string, readonly context: { status: number; isRetryable: boolean }) {
    super(message);
    this.name = "EmailSendError";
  }
}

function getRequestBody(email: OutgoingEmail, from: EmailAddress) {
  return {
    from,
    to: [email.to],
    subject: email.subject,
    text: email.text,
    html: email.html,
    ...(email.replyTo ? { reply_to: email.replyTo } : {}),
  };
}

/** Sends one email; returns MailerSend's message ID. Throws EmailSendError. */
export async function sendWithMailerSend(email: OutgoingEmail, { apiKey, from }: MailerSendSettings): Promise<string | null> {
  const response = await fetch(MAILERSEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(getRequestBody(email, from)),
  });
  if (response.status === ACCEPTED) return response.headers.get("x-message-id");
  const isRetryable = response.status === TOO_MANY_REQUESTS || response.status >= SERVER_ERROR;
  const detail = (await response.text().catch(() => "")).slice(0, MAX_ERROR_LENGTH);
  throw new EmailSendError(`MailerSend answered ${response.status}: ${detail}`, { status: response.status, isRetryable });
}
