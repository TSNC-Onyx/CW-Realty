import "server-only";

// Server-side Cloudflare Turnstile check for public forms (Infra §2 bot protection).
// Tokens are single-use and expire after 5 minutes; Cloudflare tells us which.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export { TURNSTILE_FIELD } from "@/lib/security/turnstile-field-name";
const MAX_TOKEN_LENGTH = 2048;

type SiteverifyReply = {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
  metadata?: { result_with_testing_key?: boolean };
};

export type TurnstileCheck = { token: string; remoteIp: string | null; expectedAction: string; expectedHostname: string | null };

async function fetchSiteverify(body: URLSearchParams): Promise<SiteverifyReply | null> {
  try {
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body });
    return response.ok ? ((await response.json()) as SiteverifyReply) : null;
  } catch {
    return null;
  }
}

// Cloudflare's public test keys answer for "example.com" and flag themselves; a real secret
// never returns that flag, so real answers must match this site and this form.
function isForThisForm(reply: SiteverifyReply, { expectedAction, expectedHostname }: TurnstileCheck): boolean {
  if (reply.metadata?.result_with_testing_key === true) return true;
  return reply.action === expectedAction && (expectedHostname === null || reply.hostname === expectedHostname);
}

/**
 * True when the visitor passed the check. Without a secret key, local development
 * skips the check; production never does.
 */
export async function verifyTurnstileToken(check: TurnstileCheck): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!check.token || check.token.length > MAX_TOKEN_LENGTH) return false;
  const body = new URLSearchParams({ secret, response: check.token, ...(check.remoteIp ? { remoteip: check.remoteIp } : {}) });
  const reply = await fetchSiteverify(body);
  return reply?.success === true && isForThisForm(reply, check);
}
