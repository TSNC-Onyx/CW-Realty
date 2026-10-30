import "server-only";

import { z } from "zod";

import { isSameSiteOrigin } from "@/lib/observability/problem-report-rules";
import { getErrorName, reportVisitorProblem } from "@/lib/observability/report-visitor-problem";
import { isOverConsentLimit } from "@/lib/security/rate-limit";
import { fetchVisitor } from "@/lib/security/visitor";
import { ATTRIBUTION_COOKIE, EXPIRED_ATTRIBUTION_COOKIE, getAttributionCookieString, getAttributionFromCookie, getAttributionFromField, getEarlierLanding } from "@/lib/tracking/attribution";
import { CONSENT_COOKIE, getAllowedConsent, getConsentFromCookie, getConsentReissue } from "@/lib/tracking/consent";

// POST /consent (docs/cwr-ads-analytics-fixes-plan.md, D8–D10, D16, D18). Safari keeps a cookie
// written by a script only 7 days, so the server sets the visitor's own choice again, and, while
// Advertising is allowed, keeps the ad click IDs for other tabs. The choice is read only from
// the visitor's own cookie, never from the body, so another site can't grant consent.

const MAX_BODY_BYTES = 8 * 1024;
const GPC_HEADER = "sec-gpc";
const GPC_ON = "1";
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

const consentBodySchema = z.object({ attribution: z.string().optional() });

type ConsentBody = z.infer<typeof consentBodySchema>;

type ConsentRequestFacts = { cookieHeader: string | null; isGpcOn: boolean; isSecure: boolean; now: Date };

/** Boundary: an unexpected failure is recorded and answered with 500 (D18). */
export async function respondToConsentRequest(request: Request): Promise<Response> {
  try {
    return await getConsentResponse(request);
  } catch (error) {
    await reportVisitorProblem({ action: "site.consent", stage: "unexpected", severity: "warning", code: getErrorName(error) });
    return new Response(null, { status: HTTP_SERVER_ERROR });
  }
}

async function getConsentResponse(request: Request): Promise<Response> {
  if (!isSameSiteOrigin({ origin: request.headers.get("origin"), host: request.headers.get("host") })) return new Response(null, { status: HTTP_FORBIDDEN });
  if (await isOverConsentLimit((await fetchVisitor()).ip)) return new Response(null, { status: HTTP_TOO_MANY_REQUESTS });
  const body = await readConsentBody(request);
  if (!body) return new Response(null, { status: HTTP_BAD_REQUEST });
  const cookieStrings = getCookieStrings({ facts: getRequestFacts(request), attributionField: body.attribution });
  const headers = new Headers({ "Cache-Control": "no-store" });
  cookieStrings.forEach((cookieString) => headers.append("Set-Cookie", cookieString));
  return new Response(null, { status: HTTP_NO_CONTENT, headers });
}

// Stops reading once the body passes the limit, so an oversized request is never buffered whole.
async function readTextWithinLimit(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let byteCount = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    byteCount += chunk.value.byteLength;
    if (byteCount > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

async function readConsentBody(request: Request): Promise<ConsentBody | null> {
  const text = await readTextWithinLimit(request);
  if (text === null) return null;
  const parsed = consentBodySchema.safeParse(parseJsonOrUndefined(text));
  return parsed.success ? parsed.data : null;
}

function parseJsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Not JSON: the schema then refuses it, and the caller answers 400.
    return undefined;
  }
}

function getRequestFacts(request: Request): ConsentRequestFacts {
  return {
    cookieHeader: request.headers.get("cookie"),
    isGpcOn: request.headers.get(GPC_HEADER) === GPC_ON,
    isSecure: new URL(request.url).protocol === "https:",
    now: new Date(),
  };
}

function getRequestCookie({ cookieHeader, name }: { cookieHeader: string | null; name: string }): string | undefined {
  const prefix = `${name}=`;
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

function getCookieStrings({ facts, attributionField }: { facts: ConsentRequestFacts; attributionField: string | undefined }): string[] {
  const consentValue = getRequestCookie({ cookieHeader: facts.cookieHeader, name: CONSENT_COOKIE });
  const reissue = getConsentReissue({ cookieValue: consentValue, isGpcOn: facts.isGpcOn, now: facts.now, isSecure: facts.isSecure });
  const choice = reissue ? getConsentFromCookie(consentValue) : null;
  const isAdsAllowed = choice !== null && getAllowedConsent({ choice, isGpcOn: facts.isGpcOn }).ads;
  const clickCookie = isAdsAllowed ? getClickCookieString({ facts, attributionField }) : EXPIRED_ATTRIBUTION_COOKIE;
  return [reissue?.cookieString, clickCookie].filter((cookieString): cookieString is string => Boolean(cookieString));
}

/** The click cookie to set, or null to leave the existing one alone (no new click IDs sent). */
function getClickCookieString({ facts, attributionField }: { facts: ConsentRequestFacts; attributionField: string | undefined }): string | null {
  const attribution = getAttributionFromField(attributionField ?? null);
  if (!attribution) return null;
  const stored = getAttributionFromCookie(getRequestCookie({ cookieHeader: facts.cookieHeader, name: ATTRIBUTION_COOKIE }));
  return getAttributionCookieString({ attribution: getEarlierLanding(stored, attribution), now: facts.now, isSecure: facts.isSecure });
}
