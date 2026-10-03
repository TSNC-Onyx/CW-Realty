import "server-only";

import { areTestKeysAllowed, getTurnstileSiteKey, isTestSiteKey } from "@/lib/security/bot-check-key";

// Server-side Cloudflare Turnstile check for public forms (Infra §2 bot protection;
// docs/cwr-reliability-round-plan.md §2.1). Tokens are single-use and expire after 5 minutes.
// The answer says why a check didn't pass, so a setup problem that blocks every visitor
// can't hide among ordinary bot refusals.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export { TURNSTILE_FIELD } from "@/lib/security/turnstile-field-name";
const MAX_TOKEN_LENGTH = 2048;
const SITEVERIFY_TIMEOUT_MS = 5000;
const MAX_SITEVERIFY_ATTEMPTS = 2;
const SERVER_ERROR_STATUS = 500;
const RETRYABLE_ERROR_CODE = "internal-error";

const REASON_BY_ERROR_CODE: Record<string, TurnstileReason> = {
  "missing-input-secret": "not_configured",
  "invalid-input-secret": "not_configured",
  "missing-input-response": "no_token",
  "timeout-or-duplicate": "expired",
  "invalid-input-response": "rejected",
  "bad-request": "unreachable",
  [RETRYABLE_ERROR_CODE]: "unreachable",
};

/**
 * passed · no_token: nothing to check · rejected: Cloudflare refused it · expired: too old or
 * already used · wrong_site: solved for another form or site · not_configured: no or a bad
 * secret · test_key_in_production: a testing key where real ones belong · unreachable:
 * Cloudflare didn't answer.
 */
export type TurnstileReason = "passed" | "no_token" | "rejected" | "expired" | "wrong_site" | "not_configured" | "test_key_in_production" | "unreachable";

export type TurnstileResult = { isPassed: boolean; reason: TurnstileReason; errorCodes: string[] };

export type TurnstileCheck = { token: string; remoteIp: string | null; expectedAction: string; expectedHostname: string | null };

type SiteverifyReply = {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
  metadata?: { result_with_testing_key?: boolean };
};

type SiteverifyAnswer = { kind: "reply"; reply: SiteverifyReply } | { kind: "unreachable"; errorCodes: string[] };

function getResult(reason: TurnstileReason, errorCodes: string[] = []): TurnstileResult {
  return { isPassed: reason === "passed", reason, errorCodes };
}

function isRetryable(answer: SiteverifyAnswer): boolean {
  return answer.kind === "unreachable" || (answer.reply["error-codes"] ?? []).includes(RETRYABLE_ERROR_CODE);
}

async function fetchSiteverifyOnce(body: URLSearchParams): Promise<SiteverifyAnswer> {
  try {
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS) });
    if (response.status >= SERVER_ERROR_STATUS) return { kind: "unreachable", errorCodes: [`http-${response.status}`] };
    return { kind: "reply", reply: (await response.json()) as SiteverifyReply };
  } catch (error) {
    return { kind: "unreachable", errorCodes: [error instanceof Error ? error.name : "fetch-failed"] };
  }
}

// The same idempotency key lets Cloudflare answer a retry without spending the token twice.
async function fetchSiteverify(body: URLSearchParams): Promise<SiteverifyAnswer> {
  let answer = await fetchSiteverifyOnce(body);
  for (let attempt = 1; attempt < MAX_SITEVERIFY_ATTEMPTS && isRetryable(answer); attempt += 1) answer = await fetchSiteverifyOnce(body);
  return answer;
}

function getReplyResult(reply: SiteverifyReply, check: TurnstileCheck): TurnstileResult {
  const errorCodes = reply["error-codes"] ?? [];
  if (!reply.success) return getResult(errorCodes.map((code) => REASON_BY_ERROR_CODE[code]).find(Boolean) ?? "rejected", errorCodes);
  // Cloudflare's test keys answer for "example.com" and flag themselves.
  if (reply.metadata?.result_with_testing_key === true) return getResult(areTestKeysAllowed() ? "passed" : "test_key_in_production", errorCodes);
  const isForThisForm = reply.action === check.expectedAction && (check.expectedHostname === null || reply.hostname === check.expectedHostname);
  return getResult(isForThisForm ? "passed" : "wrong_site", errorCodes);
}

/** Why the check did or didn't pass. Never throws. */
export async function checkTurnstileToken(check: TurnstileCheck): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return getResult(process.env.NODE_ENV === "production" ? "not_configured" : "passed");
  if (!areTestKeysAllowed() && isTestSiteKey(getTurnstileSiteKey())) return getResult("test_key_in_production");
  if (!check.token || check.token.length > MAX_TOKEN_LENGTH) return getResult("no_token");
  const body = new URLSearchParams({ secret, response: check.token, idempotency_key: crypto.randomUUID(), ...(check.remoteIp ? { remoteip: check.remoteIp } : {}) });
  const answer = await fetchSiteverify(body);
  return answer.kind === "reply" ? getReplyResult(answer.reply, check) : getResult("unreachable", answer.errorCodes);
}

/** True when the visitor passed the check. Without a secret, local development skips it. */
export async function verifyTurnstileToken(check: TurnstileCheck): Promise<boolean> {
  return (await checkTurnstileToken(check)).isPassed;
}
