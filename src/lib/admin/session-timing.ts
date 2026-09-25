// Admin session limits from NIST SP 800-63B for AAL2: sign in again after 30 minutes
// without activity or 12 hours after signing in, whichever comes first (Admin §7).

export const IDLE_LIMIT_MS = 30 * 60 * 1000;
export const IDLE_WARNING_MS = 28 * 60 * 1000;
export const ABSOLUTE_LIMIT_MS = 12 * 60 * 60 * 1000;
export const ACTIVITY_COOKIE = "cwr-admin-activity";

export type AuthMethodStamp = { method?: string; timestamp?: number };

export type SessionTimes = { signedInAtMs: number | null; lastActivityAtMs: number | null; nowMs: number };

function getAuthTimestampsMs(authMethods: AuthMethodStamp[] | undefined): number[] {
  return (authMethods ?? []).map((stamp) => stamp.timestamp).filter((stamp): stamp is number => typeof stamp === "number").map((seconds) => seconds * 1000);
}

/** Earliest sign-in step recorded in the signed session token (`amr` claim, seconds). */
export function getSignedInAtMs(authMethods: AuthMethodStamp[] | undefined): number | null {
  const timestamps = getAuthTimestampsMs(authMethods);
  return timestamps.length > 0 ? Math.min(...timestamps) : null;
}

/** Latest sign-in step (for example the authenticator code) — the start of activity. */
export function getLatestAuthAtMs(authMethods: AuthMethodStamp[] | undefined): number | null {
  const timestamps = getAuthTimestampsMs(authMethods);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

export function getLastActivityAtMs(cookieValue: string | undefined): number | null {
  const value = Number(cookieValue);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * lastActivityAtMs is the activity cookie, or the latest sign-in step when the cookie is
 * missing. Unknown times count as expired, so a lost cookie never extends a session.
 */
export function isSessionExpired({ signedInAtMs, lastActivityAtMs, nowMs }: SessionTimes): boolean {
  if (signedInAtMs === null || lastActivityAtMs === null) return true;
  return nowMs - signedInAtMs > ABSOLUTE_LIMIT_MS || nowMs - lastActivityAtMs > IDLE_LIMIT_MS;
}
