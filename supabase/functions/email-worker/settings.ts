import type { EmailSettings, EmailTransport } from "./sender.ts";
import { SITE_URL } from "./site-values.ts";

// The email-worker's settings, read from its environment (Supabase → Edge Functions → Secrets
// on the live project; supabase/functions/.env locally). Links and the logo use EMAIL_SITE_URL,
// which must be one of the addresses that serve the new site.

export const ALLOWED_SITE_URLS = [SITE_URL, "https://charliewardrealty.com", "https://cw-realty.builtfor.workers.dev", "http://127.0.0.1:3100", "http://localhost:3100"];

const TRANSPORTS: EmailTransport[] = ["mailersend", "mailpit", "log"];

export type WorkerSettings = { siteUrl: string; email: EmailSettings };

export class WorkerSettingsError extends Error {
  constructor(message: string, readonly context: { setting: string }) {
    super(message);
    this.name = "WorkerSettingsError";
  }
}

function getTransport(value: string | undefined): EmailTransport {
  const transport = (value || "mailersend") as EmailTransport;
  if (!TRANSPORTS.includes(transport)) throw new WorkerSettingsError(`EMAIL_TRANSPORT must be one of ${TRANSPORTS.join(", ")}`, { setting: "EMAIL_TRANSPORT" });
  return transport;
}

function getSiteUrl(value: string | undefined): string {
  const siteUrl = (value || SITE_URL).replace(/\/+$/, "");
  if (!ALLOWED_SITE_URLS.includes(siteUrl)) throw new WorkerSettingsError("EMAIL_SITE_URL is not an address that serves the site", { setting: "EMAIL_SITE_URL" });
  return siteUrl;
}

/** Throws WorkerSettingsError for a setting that would send wrong or test email. */
export function getWorkerSettings(getValue: (name: string) => string | undefined): WorkerSettings {
  const transport = getTransport(getValue("EMAIL_TRANSPORT"));
  const siteUrl = getSiteUrl(getValue("EMAIL_SITE_URL"));
  const isLiveSite = siteUrl.startsWith("https://");
  if (isLiveSite && transport !== "mailersend") throw new WorkerSettingsError("Only MailerSend may send for the live site", { setting: "EMAIL_TRANSPORT" });
  return {
    siteUrl,
    email: {
      transport,
      apiKey: getValue("MAILERSEND_API_KEY"),
      fromEmail: getValue("ALERT_FROM_EMAIL"),
      fromName: getValue("ALERT_FROM_NAME"),
      mailpitUrl: getValue("MAILPIT_URL"),
    },
  };
}
