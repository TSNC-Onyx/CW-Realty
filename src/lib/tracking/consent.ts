import { parseJsonOrNull } from "@/lib/tracking/parse-json";

// The visitor's cookie choice (Features §4): Analytics and Advertising, kept in a first-party
// cookie so the server can honor it too. Global Privacy Control always turns Advertising off.
// Plain checks instead of a schema library: this runs on every public page, so it stays tiny.

export const CONSENT_COOKIE = "cwr_consent";
// Raise this when the trackers or their purposes change, so every visitor is asked again.
export const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export type ConsentChoice = { analytics: boolean; ads: boolean };

type StoredConsent = ConsentChoice & { v: typeof CONSENT_VERSION };

export const REJECTED_CONSENT: ConsentChoice = { analytics: false, ads: false };

function isStoredConsent(value: unknown): value is StoredConsent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.v === CONSENT_VERSION && typeof record.analytics === "boolean" && typeof record.ads === "boolean";
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

/** The saved choice, or null when the visitor has not chosen (or chose under an older version). */
export function getConsentFromCookie(value: string | undefined): ConsentChoice | null {
  if (!value) return null;
  const stored = parseJsonOrNull(decodeCookieValue(value));
  if (!isStoredConsent(stored)) return null;
  return { analytics: stored.analytics, ads: stored.ads };
}

/** Global Privacy Control means "do not sell or share": Advertising can never be on. */
export function getAllowedConsent({ choice, isGpcOn }: { choice: ConsentChoice; isGpcOn: boolean }): ConsentChoice {
  return { analytics: choice.analytics, ads: choice.ads && !isGpcOn };
}

export function getAcceptAllConsent({ isGpcOn }: { isGpcOn: boolean }): ConsentChoice {
  return getAllowedConsent({ choice: { analytics: true, ads: true }, isGpcOn });
}

export function hasAnyConsent(choice: ConsentChoice | null): boolean {
  return Boolean(choice && (choice.analytics || choice.ads));
}

/** A full Set-Cookie style string for document.cookie. */
export function getConsentCookieString({ choice, now, isSecure }: { choice: ConsentChoice; now: Date; isSecure: boolean }): string {
  const value = encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, analytics: choice.analytics, ads: choice.ads, at: now.toISOString() }));
  const secureFlag = isSecure ? "; Secure" : "";
  return `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secureFlag}`;
}
