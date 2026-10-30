import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLeadAttributionRow } from "@/lib/tracking/attribution";
import { fetchLeadTracking, getFormConversion, scheduleMetaLead, type LeadTracking } from "@/lib/tracking/lead-tracking";

const reportProblem = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/observability/report-problem", () => ({ reportProblem }));
vi.mock("@/lib/supabase/service-client", () => ({ isServiceAccessConfigured: () => true, createServiceClient: () => ({ rpc }) }));
vi.mock("@/lib/tracking/tracking-settings", () => ({ fetchTrackingSettings: async () => ({ gtmContainerId: "GTM-AB12CD3", metaPixelId: "1234567890123" }) }));

const CONTACT = { email: "Jordan@Example.com", phone: "+13365550123" };
const NO_ADS: LeadTracking = { isAdsAllowed: false, attributionRow: null, fbc: null, fbp: null, sourceUrl: null, userAgent: null };
const VISITOR = { ip: "203.0.113.1", hostname: "www.charliewardrealty.com" };
const FBCLID = "IwAR0abcdefghij";
const LANDED_AT = 1790337600000;
const ADS_ALLOWED: LeadTracking = {
  isAdsAllowed: true,
  attributionRow: getLeadAttributionRow({ attribution: { fbclid: FBCLID, landingPath: "/", landedAt: LANDED_AT }, fbc: null, fbp: null }),
  fbc: null,
  fbp: null,
  sourceUrl: "https://www.charliewardrealty.com/contact",
  userAgent: "Mozilla/5.0",
};

/** Schedules the lead, then runs the work Next.js would run after the reply. */
async function runMetaLead(tracking: LeadTracking): Promise<void> {
  const { after } = await import("next/server");
  scheduleMetaLead({ source: "contact", eventId: "key", contact: CONTACT, tracking, visitor: VISITOR });
  const work = vi.mocked(after).mock.calls.at(-1)?.[0] as (() => Promise<void>) | undefined;
  await work?.();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "secret-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getFormConversion", () => {
  it("gives the browser only the event ID when Advertising is not allowed", async () => {
    // Arrange / Act
    const conversion = await getFormConversion({ eventId: "key", contact: CONTACT, tracking: NO_ADS });

    // Assert
    expect(conversion).toEqual({ eventId: "key", userData: null });
  });

  it("adds Google-ready hashes when Advertising is allowed", async () => {
    // Arrange / Act
    const conversion = await getFormConversion({ eventId: "key", contact: CONTACT, tracking: { ...NO_ADS, isAdsAllowed: true } });

    // Assert
    expect(conversion.userData).toEqual({
      sha256_email_address: createHash("sha256").update("jordan@example.com").digest("hex"),
      sha256_phone_number: createHash("sha256").update("+13365550123").digest("hex"),
    });
  });
});

describe("scheduleMetaLead", () => {
  it("schedules nothing when Advertising is not allowed", async () => {
    // Arrange
    const { after } = await import("next/server");

    // Act
    scheduleMetaLead({ source: "contact", eventId: "key", contact: CONTACT, tracking: NO_ADS, visitor: VISITOR });

    // Assert
    expect(after).not.toHaveBeenCalled();
  });
});

describe("sending a lead to Meta", () => {
  it("sends Meta the click value built from the ad link when the Pixel set no click cookie", async () => {
    // Arrange
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    // Act
    await runMetaLead(ADS_ALLOWED);

    // Assert
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { data: { user_data: { fbc?: string } }[] };
    expect(body.data[0]?.user_data.fbc).toBe(`fb.1.${LANDED_AT}.${FBCLID}`);
  });

  it("records a problem and marks the Meta check failing when Meta refuses the event", async () => {
    // Arrange
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 })));

    // Act
    await runMetaLead(ADS_ALLOWED);

    // Assert
    expect({ problem: reportProblem.mock.calls[0]?.[0], check: rpc.mock.calls[0] }).toEqual({
      problem: { action: "tracking.meta_send", origin: "job", stage: "external", severity: "error", code: "http_400", detail: "Meta answered 400, error code 190" },
      check: ["touch_health_check", { p_name: "meta_conversions", p_is_ok: false, p_error: "Meta answered 400, error code 190" }],
    });
  });

  it("marks the Meta check healthy after Meta accepts the event", async () => {
    // Arrange
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));

    // Act
    await runMetaLead(ADS_ALLOWED);

    // Assert
    expect({ checks: rpc.mock.calls, problems: reportProblem.mock.calls }).toEqual({
      checks: [["touch_health_check", { p_name: "meta_conversions", p_is_ok: true, p_error: null }]],
      problems: [],
    });
  });

  it("logs a Meta timeout without marking the check failing", async () => {
    // Arrange
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"))));

    // Act
    await runMetaLead(ADS_ALLOWED);

    // Assert
    expect({ code: reportProblem.mock.calls[0]?.[0]?.code, checks: rpc.mock.calls }).toEqual({ code: "timeout", checks: [] });
  });
});

const COOKIE_CLICK = { gclid: "Cj0KCQjwcookie123", landingPath: "/", landedAt: 1727265600000 };
const FIELD_CLICK = { gclid: "Cj0KCQjwfield4567", landingPath: "/contact", landedAt: 1727265700000 };

/** A visitor whose browser sends these cookies and headers; the form carries `field` as its hidden value. */
async function fetchTrackingFor({ choice, field }: { choice: { analytics: boolean; ads: boolean }; field: string }): Promise<LeadTracking> {
  const cookieValues: Record<string, string> = {
    cwr_consent: encodeURIComponent(JSON.stringify({ v: 1, ...choice, at: "2026-09-25T12:00:00.000Z" })),
    cwr_attribution: encodeURIComponent(JSON.stringify(COOKIE_CLICK)),
  };
  const { cookies, headers } = await import("next/headers");
  vi.mocked(cookies).mockResolvedValue({ get: (name: string) => (cookieValues[name] ? { name, value: cookieValues[name] } : undefined) } as never);
  vi.mocked(headers).mockResolvedValue(new Headers({ "user-agent": "Mozilla/5.0" }) as never);
  const formData = new FormData();
  formData.set("attribution", field);
  return fetchLeadTracking(formData);
}

describe("fetchLeadTracking with the click cookie", () => {
  it("uses the click cookie when the form's hidden field is empty", async () => {
    // Act
    const tracking = await fetchTrackingFor({ choice: { analytics: true, ads: true }, field: "" });

    // Assert
    expect(tracking.attributionRow?.gclid).toBe(COOKIE_CLICK.gclid);
  });

  it("prefers the form's hidden field over the click cookie", async () => {
    // Act
    const tracking = await fetchTrackingFor({ choice: { analytics: true, ads: true }, field: JSON.stringify(FIELD_CLICK) });

    // Assert
    expect(tracking.attributionRow?.gclid).toBe(FIELD_CLICK.gclid);
  });

  it("ignores the click cookie when Advertising is not allowed", async () => {
    // Act
    const tracking = await fetchTrackingFor({ choice: { analytics: true, ads: false }, field: "" });

    // Assert
    expect(tracking.attributionRow).toBeNull();
  });
});

describe("fetchLeadTracking", () => {
  it("refuses advertising when the browser sends Global Privacy Control, whatever the cookie says", async () => {
    // Arrange
    const cookieValue = encodeURIComponent(JSON.stringify({ v: 1, analytics: true, ads: true, at: "2026-09-25T12:00:00.000Z" }));
    const { cookies, headers } = await import("next/headers");
    vi.mocked(cookies).mockResolvedValue({ get: (name: string) => (name === "cwr_consent" ? { name, value: cookieValue } : undefined) } as never);
    vi.mocked(headers).mockResolvedValue(new Headers({ "sec-gpc": "1", "user-agent": "Mozilla/5.0" }) as never);
    const formData = new FormData();
    formData.set("attribution", JSON.stringify({ gclid: "Cj0KCQjwabc123", landingPath: "/", landedAt: 1727265600000 }));

    // Act
    const tracking = await fetchLeadTracking(formData);

    // Assert
    expect({ isAdsAllowed: tracking.isAdsAllowed, attributionRow: tracking.attributionRow }).toEqual({ isAdsAllowed: false, attributionRow: null });
  });
});
