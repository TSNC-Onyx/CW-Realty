import { beforeEach, describe, expect, it, vi } from "vitest";

import { respondToConsentRequest } from "@/lib/tracking/consent-endpoint";

const reportProblem = vi.hoisted(() => vi.fn());
const isOverConsentLimit = vi.hoisted(() => vi.fn(async () => false));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/observability/report-problem", () => ({ reportProblem }));
vi.mock("@/lib/security/rate-limit", () => ({ isOverConsentLimit }));
vi.mock("@/lib/security/visitor", () => ({ fetchVisitor: async () => ({ ip: "203.0.113.1", hostname: "www.charliewardrealty.com" }) }));

const SITE = "https://www.charliewardrealty.com";
const RECENT_CHOICE_AT = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const CLICK = { gclid: "Cj0KCQjwabc123_XYZ", landingPath: "/contact", landedAt: Date.now() - 60 * 60 * 1000 };

type ConsentCall = { origin?: string; choice?: { analytics: boolean; ads: boolean }; body?: string; isGpcOn?: boolean; clickCookie?: string };

function getConsentCookie(choice: { analytics: boolean; ads: boolean }): string {
  return `cwr_consent=${encodeURIComponent(JSON.stringify({ v: 1, ...choice, at: RECENT_CHOICE_AT }))}`;
}

function buildRequest({ origin = SITE, choice, body = JSON.stringify({ attribution: JSON.stringify(CLICK) }), isGpcOn = false, clickCookie }: ConsentCall): Request {
  const cookies = [choice ? getConsentCookie(choice) : null, clickCookie ? `cwr_attribution=${clickCookie}` : null].filter(Boolean).join("; ");
  const headers = new Headers({ origin, host: "www.charliewardrealty.com", "content-type": "application/json" });
  if (cookies) headers.set("cookie", cookies);
  if (isGpcOn) headers.set("sec-gpc", "1");
  return new Request(`${SITE}/consent`, { method: "POST", headers, body });
}

function getSetCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

function getClickCookie(response: Response): string | undefined {
  return getSetCookies(response).find((cookie) => cookie.startsWith("cwr_attribution="));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("respondToConsentRequest", () => {
  it("refuses calls from other sites", async () => {
    // Act
    const response = await respondToConsentRequest(buildRequest({ origin: "https://evil.example.com", choice: { analytics: true, ads: true } }));

    // Assert
    expect({ status: response.status, cookies: getSetCookies(response) }).toEqual({ status: 403, cookies: [] });
  });

  it("refuses calls over the limit", async () => {
    // Arrange
    isOverConsentLimit.mockResolvedValueOnce(true);

    // Act
    const response = await respondToConsentRequest(buildRequest({ choice: { analytics: true, ads: true } }));

    // Assert
    expect(response.status).toBe(429);
  });

  it("refuses a body that is too large or not JSON", async () => {
    // Arrange
    const bodies = [JSON.stringify({ attribution: "x".repeat(9000) }), "not json", JSON.stringify({ attribution: 42 })];

    // Act
    const responses = await Promise.all(bodies.map((body) => respondToConsentRequest(buildRequest({ choice: { analytics: true, ads: true }, body }))));

    // Assert
    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
  });

  it("counts the body's size in bytes, not characters", async () => {
    // Arrange: 5,000 two-byte characters are 10,000 bytes, over the 8 KB limit.
    const body = JSON.stringify({ attribution: "é".repeat(5000) });

    // Act
    const response = await respondToConsentRequest(buildRequest({ choice: { analytics: true, ads: true }, body }));

    // Assert
    expect(response.status).toBe(400);
  });

  it("re-issues the consent cookie from the server", async () => {
    // Act
    const response = await respondToConsentRequest(buildRequest({ choice: { analytics: true, ads: false }, body: "{}" }));

    // Assert
    const consentCookie = getSetCookies(response).find((cookie) => cookie.startsWith("cwr_consent="));
    expect({ status: response.status, cacheControl: response.headers.get("cache-control"), consentCookie }).toEqual({
      status: 204,
      cacheControl: "no-store",
      consentCookie: expect.stringMatching(/^cwr_consent=[^;]+; Path=\/; Max-Age=\d+; SameSite=Lax; Secure$/),
    });
  });

  it("sets no consent cookie and expires the click cookie when the visitor has not chosen", async () => {
    // Act
    const response = await respondToConsentRequest(buildRequest({}));

    // Assert
    expect(getSetCookies(response)).toEqual(["cwr_attribution=; Path=/; Max-Age=0; SameSite=Lax"]);
  });

  it("keeps click IDs in a cookie only when Advertising is allowed", async () => {
    // Act
    const response = await respondToConsentRequest(buildRequest({ choice: { analytics: false, ads: true } }));

    // Assert
    const value = getClickCookie(response)?.split(";")[0]?.slice("cwr_attribution=".length) ?? "";
    expect(JSON.parse(decodeURIComponent(value))).toEqual(CLICK);
  });

  it("deletes the click cookie when Advertising is off", async () => {
    // Act
    const response = await respondToConsentRequest(buildRequest({ choice: { analytics: true, ads: false }, clickCookie: encodeURIComponent(JSON.stringify(CLICK)) }));

    // Assert
    expect(getClickCookie(response)).toBe("cwr_attribution=; Path=/; Max-Age=0; SameSite=Lax");
  });

  it("deletes the click cookie under Global Privacy Control", async () => {
    // Act
    const response = await respondToConsentRequest(buildRequest({ choice: { analytics: true, ads: true }, isGpcOn: true }));

    // Assert
    expect(getClickCookie(response)).toBe("cwr_attribution=; Path=/; Max-Age=0; SameSite=Lax");
  });

  it("records an unexpected failure and answers 500", async () => {
    // Arrange
    isOverConsentLimit.mockRejectedValueOnce(new TypeError("limiter broke"));

    // Act
    const response = await respondToConsentRequest(buildRequest({ choice: { analytics: true, ads: true } }));

    // Assert
    expect({ status: response.status, problem: reportProblem.mock.calls[0]?.[0] }).toEqual({
      status: 500,
      problem: { action: "site.consent", stage: "unexpected", severity: "warning", code: "TypeError", origin: "server_visitor", actorId: null, actorRole: null },
    });
  });
});
