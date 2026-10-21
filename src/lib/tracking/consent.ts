import { parseJsonOrNull } from "@/lib/tracking/parse-json";

// The visitor's cookie choice (Features §4): Analytics and Advertising, kept in a first-party
// cookie so the server can honor it too. Global Privacy Control always turns Advertising off.
// Plain checks instead of a schema library: this runs on every public page, so it stays tiny.

export const CONSENT_COOKIE = "cwr_consent";
// Raise this when the trackers or their purposes change, so every visitor is asked again.
export const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
const MS_PER_SECOND = 1000;
// A device clock running fast makes a fresh choice look a little in the future (plan R7).
const CLOCK_ALLOWANCE_MS = 24 * 60 * 60 * MS_PER_SECOND;

export type ConsentChoice = { analytics: boolean; ads: boolean };

type StoredConsent = ConsentChoice & { v: typeof CONSENT_VERSION; at?: unknown };

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

function getStoredConsent(value: string | undefined): StoredConsent | null {
  if (!value) return null;
  const stored = parseJsonOrNull(decodeCookieValue(value));
  return isStoredConsent(stored) ? stored : null;
}

/** The saved choice, or null when the visitor has not chosen (or chose under an older version). */
export function getConsentFromCookie(value: string | undefined): ConsentChoice | null {
  const stored = getStoredConsent(value);
  if (!stored) return null;
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

function getCookieText({ choice, at, maxAgeSeconds, isSecure }: { choice: ConsentChoice; at: string; maxAgeSeconds: number; isSecure: boolean }): string {
  const value = encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, analytics: choice.analytics, ads: choice.ads, at }));
  const secureFlag = isSecure ? "; Secure" : "";
  return `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureFlag}`;
}

/** A full Set-Cookie style string for document.cookie. */
export function getConsentCookieString({ choice, now, isSecure }: { choice: ConsentChoice; now: Date; isSecure: boolean }): string {
  return getCookieText({ choice, at: now.toISOString(), maxAgeSeconds: CONSENT_MAX_AGE_SECONDS, isSecure });
}

/** When the choice was made, in ms; a time up to a day ahead counts as now; null if missing or further ahead. */
function getChoiceTime({ at, now }: { at: unknown; now: Date }): number | null {
  if (typeof at !== "string") return null;
  const madeAt = Date.parse(at);
  if (Number.isNaN(madeAt) || madeAt > now.getTime() + CLOCK_ALLOWANCE_MS) return null;
  return Math.min(madeAt, now.getTime());
}

/**
 * The same choice for the server to set again (Safari keeps a script-written cookie only 7 days),
 * with what is left of its 180 days, so a re-issue never extends consent (plan D9). Advertising
 * is turned off under Global Privacy Control. Null for a missing, older, undated, or expired choice.
 */
export function getConsentReissue({ cookieValue, isGpcOn, now, isSecure }: { cookieValue: string | undefined; isGpcOn: boolean; now: Date; isSecure: boolean }): { cookieString: string } | null {
  const stored = getStoredConsent(cookieValue);
  const madeAt = stored ? getChoiceTime({ at: stored.at, now }) : null;
  if (!stored || madeAt === null) return null;
  const maxAgeSeconds = Math.floor((madeAt + CONSENT_MAX_AGE_SECONDS * MS_PER_SECOND - now.getTime()) / MS_PER_SECOND);
  if (maxAgeSeconds <= 0) return null;
  const choice = getAllowedConsent({ choice: stored, isGpcOn });
  return { cookieString: getCookieText({ choice, at: stored.at as string, maxAgeSeconds, isSecure }) };
}
