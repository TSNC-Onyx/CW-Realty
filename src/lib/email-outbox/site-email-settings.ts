import { getEmailSender, isEmailConfigured, type EmailSender, type EmailSettings } from "../../../supabase/functions/email-worker/sender.ts";

// The site's own MailerSend settings, used only by the old Cloudflare Queue path until the
// outbox is live (docs/cwr-email-outbox-plan.md). After cutover the email-worker sends.

function getSiteEmailSettings(): EmailSettings {
  return { transport: "mailersend", apiKey: process.env.MAILERSEND_API_KEY, fromEmail: process.env.ALERT_FROM_EMAIL, fromName: process.env.ALERT_FROM_NAME };
}

export function getSiteEmailSender(): EmailSender {
  return getEmailSender(getSiteEmailSettings());
}

export function isSiteEmailConfigured(): boolean {
  return isEmailConfigured(getSiteEmailSettings());
}
