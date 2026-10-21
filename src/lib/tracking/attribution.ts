import { parseJsonOrNull } from "@/lib/tracking/parse-json";

// Ad click IDs and campaign tags from the link a visitor arrived on (Features §3 UTM tags and
// offline conversions). The same rules check them in the browser and again on the server.
// Plain checks instead of a schema library: this runs on every public page, so it stays tiny.

export const ATTRIBUTION_FIELD_NAME = "attribution";
// The click IDs kept for other tabs once Advertising is allowed (docs/cwr-ads-analytics-fixes-plan.md, D10).
export const ATTRIBUTION_COOKIE = "cwr_attribution";
/** Deletes the click cookie; host-only with Path=/, like the copy the server sets. */
export const EXPIRED_ATTRIBUTION_COOKIE = `${ATTRIBUTION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
// Google accepts offline conversions for clicks up to 90 days old, so the cookie ends then.
const MS_PER_SECOND = 1000;
const ATTRIBUTION_COOKIE_LIFE_MS = 90 * 24 * 60 * 60 * MS_PER_SECOND;
// Browsers drop cookies over about 4 KB without any error (D16).
const MAX_COOKIE_VALUE_LENGTH = 3800;
const CLICK_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;
const FBCLID_PATTERN = /^[A-Za-z0-9_-]{10,255}$/;
const LANDING_PATH_PATTERN = /^\/[^?#]*$/;
const MAX_TAG_LENGTH = 100;
const MAX_PATH_LENGTH = 255;
// Meta's click cookie format: fb.{subdomain index}.{creation time in ms}.{fbclid}.
const FBC_SUBDOMAIN_INDEX = 1;

const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid", "fbclid"] as const;
const PARAM_KEYS = [...CLICK_ID_KEYS, "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

type ParamKey = (typeof PARAM_KEYS)[number];

export type Attribution = Partial<Record<ParamKey, string>> & { landingPath: string; landedAt: number };

function isValidTag(value: string): boolean {
  return value.length > 0 && value.length <= MAX_TAG_LENGTH;
}

const PARAM_CHECKS: Record<ParamKey, (value: string) => boolean> = {
  gclid: (value) => CLICK_ID_PATTERN.test(value),
  gbraid: (value) => CLICK_ID_PATTERN.test(value),
  wbraid: (value) => CLICK_ID_PATTERN.test(value),
  fbclid: (value) => FBCLID_PATTERN.test(value),
  utm_source: isValidTag,
  utm_medium: isValidTag,
  utm_campaign: isValidTag,
  utm_term: isValidTag,
  utm_content: isValidTag,
};

function isValidLanding({ landingPath, landedAt }: { landingPath: unknown; landedAt: unknown }): boolean {
  const isPathValid = typeof landingPath === "string" && landingPath.length <= MAX_PATH_LENGTH && LANDING_PATH_PATTERN.test(landingPath);
  return isPathValid && Number.isSafeInteger(landedAt) && (landedAt as number) > 0;
}

/** The known, valid parameters in a record; null if any known one is present but invalid. */
function getCheckedParams(record: Record<string, unknown>): Partial<Record<ParamKey, string>> | null {
  const present = PARAM_KEYS.filter((key) => record[key] !== undefined);
  const isEveryValid = present.every((key) => typeof record[key] === "string" && PARAM_CHECKS[key](record[key]));
  return isEveryValid ? Object.fromEntries(present.map((key) => [key, record[key]])) : null;
}

function getValidParams(params: URLSearchParams): Partial<Record<ParamKey, string>> {
  const validEntries = PARAM_KEYS.flatMap((key) => {
    const value = params.get(key)?.trim();
    return value !== undefined && PARAM_CHECKS[key](value) ? [[key, value]] : [];
  });
  return Object.fromEntries(validEntries);
}

/** Click IDs and campaign tags in a landing URL, or null when the link carried none. */
export function getAttributionFromUrl({ url, landedAt }: { url: URL; landedAt: number }): Attribution | null {
  const params = getValidParams(url.searchParams);
  if (Object.keys(params).length === 0) return null;
  return { ...params, landingPath: url.pathname.slice(0, MAX_PATH_LENGTH), landedAt };
}

/** The hidden form field's value, checked; anything unexpected is dropped. */
export function getAttributionFromField(value: FormDataEntryValue | null): Attribution | null {
  if (typeof value !== "string" || value === "") return null;
  const parsed = parseJsonOrNull(value);
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const params = getCheckedParams(record);
  if (!params || !isValidLanding({ landingPath: record.landingPath, landedAt: record.landedAt })) return null;
  return { ...params, landingPath: record.landingPath as string, landedAt: record.landedAt as number };
}

/**
 * The current address with the landing page's click IDs added back where missing, or null when
 * none is missing (docs/cwr-ads-analytics-fixes-plan.md, D4). Campaign tags are not brought back;
 * every other parameter and the #anchor stay exactly as they were.
 */
export function getAddressWithClickIds({ href, attribution }: { href: string; attribution: Attribution }): string | null {
  const url = new URL(href);
  const missing = CLICK_ID_KEYS.flatMap((key) => (attribution[key] !== undefined && !url.searchParams.has(key) ? [[key, attribution[key]]] : []));
  if (missing.length === 0) return null;
  // Appended as text, so the existing parameters keep their own encoding.
  const added = new URLSearchParams(missing).toString();
  url.search = url.search ? `${url.search}&${added}` : `?${added}`;
  return url.href;
}

/** True when both hold the same parameters, landing page, and landing time. */
export function isSameAttribution(first: Attribution | null, second: Attribution | null): boolean {
  if (!first || !second) return first === second;
  const isSameLanding = first.landingPath === second.landingPath && first.landedAt === second.landedAt;
  return isSameLanding && PARAM_KEYS.every((key) => first[key] === second[key]);
}

function isSameClick(first: Attribution, second: Attribution): boolean {
  const hasClickId = CLICK_ID_KEYS.some((key) => first[key] !== undefined);
  return hasClickId && CLICK_ID_KEYS.every((key) => first[key] === second[key]);
}

/**
 * The landing to keep: the earlier one when both came from the same ad click (an address that
 * still holds the click ID was reloaded), so Meta's click time and the 90-day window never move (D17).
 */
export function getEarlierLanding(previous: Attribution | null, next: Attribution): Attribution {
  return previous && isSameClick(previous, next) ? previous : next;
}

function getWithoutCampaignTags(attribution: Attribution): Attribution {
  const clickIds = CLICK_ID_KEYS.filter((key) => attribution[key] !== undefined).map((key) => [key, attribution[key]]);
  return { ...Object.fromEntries(clickIds), landingPath: attribution.landingPath, landedAt: attribution.landedAt };
}

function getEncodedOrNull(attribution: Attribution): string | null {
  try {
    return encodeURIComponent(JSON.stringify(attribution));
  } catch {
    // Unpaired characters can't be encoded: no cookie is the safe result.
    return null;
  }
}

function getFittingCookieValue(attribution: Attribution): string | null {
  const full = getEncodedOrNull(attribution);
  if (full !== null && full.length <= MAX_COOKIE_VALUE_LENGTH) return full;
  const clickIdsOnly = getEncodedOrNull(getWithoutCampaignTags(attribution));
  return clickIdsOnly !== null && clickIdsOnly.length <= MAX_COOKIE_VALUE_LENGTH ? clickIdsOnly : null;
}

/** The Set-Cookie value keeping the click IDs until 90 days after the ad click; null when too old or too big. */
export function getAttributionCookieString({ attribution, now, isSecure }: { attribution: Attribution; now: Date; isSecure: boolean }): string | null {
  const remainingMs = Math.min(ATTRIBUTION_COOKIE_LIFE_MS - (now.getTime() - attribution.landedAt), ATTRIBUTION_COOKIE_LIFE_MS);
  const maxAgeSeconds = Math.floor(remainingMs / MS_PER_SECOND);
  if (maxAgeSeconds <= 0) return null;
  const value = getFittingCookieValue(attribution);
  if (!value) return null;
  const secureFlag = isSecure ? "; Secure" : "";
  return `${ATTRIBUTION_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureFlag}`;
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

/** The click cookie's value, checked like the form field; anything unexpected is dropped. */
export function getAttributionFromCookie(value: string | undefined): Attribution | null {
  if (!value) return null;
  return getAttributionFromField(decodeCookieValue(value));
}

/** Meta's click value built from the landing link, for when the Pixel has not set its own cookie. */
export function getFbcFromAttribution(attribution: Attribution): string | null {
  if (!attribution.fbclid) return null;
  return `fb.${FBC_SUBDOMAIN_INDEX}.${attribution.landedAt}.${attribution.fbclid}`;
}

export type LeadAttributionRow = {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbc: string | null;
  fbp: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_path: string | null;
};

/**
 * The row saved with a lead whose visitor allowed Advertising. It is saved even when empty: the
 * row itself records the consent, so the hashed email can still be matched for a closed deal.
 * Every column is present (multi-row inserts need that).
 */
export function getLeadAttributionRow({ attribution, fbc, fbp }: { attribution: Attribution | null; fbc: string | null; fbp: string | null }): LeadAttributionRow {
  const clickFbc = fbc ?? (attribution ? getFbcFromAttribution(attribution) : null);
  return {
    gclid: attribution?.gclid ?? null,
    gbraid: attribution?.gbraid ?? null,
    wbraid: attribution?.wbraid ?? null,
    fbc: clickFbc,
    fbp,
    utm_source: attribution?.utm_source ?? null,
    utm_medium: attribution?.utm_medium ?? null,
    utm_campaign: attribution?.utm_campaign ?? null,
    utm_term: attribution?.utm_term ?? null,
    utm_content: attribution?.utm_content ?? null,
    landing_path: attribution?.landingPath ?? null,
  };
}
