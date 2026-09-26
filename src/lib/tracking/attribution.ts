import { parseJsonOrNull } from "@/lib/tracking/parse-json";

// Ad click IDs and campaign tags from the link a visitor arrived on (Features §3 UTM tags and
// offline conversions). The same rules check them in the browser and again on the server.
// Plain checks instead of a schema library: this runs on every public page, so it stays tiny.

export const ATTRIBUTION_FIELD_NAME = "attribution";
const CLICK_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;
const FBCLID_PATTERN = /^[A-Za-z0-9_-]{10,255}$/;
const LANDING_PATH_PATTERN = /^\/[^?#]*$/;
const MAX_TAG_LENGTH = 100;
const MAX_PATH_LENGTH = 255;
// Meta's click cookie format: fb.{subdomain index}.{creation time in ms}.{fbclid}.
const FBC_SUBDOMAIN_INDEX = 1;

const PARAM_KEYS = ["gclid", "gbraid", "wbraid", "fbclid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

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
