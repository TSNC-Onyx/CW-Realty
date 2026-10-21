import { describe, expect, it } from "vitest";

import {
  getAddressWithClickIds,
  getAttributionCookieString,
  getAttributionFromCookie,
  getAttributionFromField,
  getAttributionFromUrl,
  getEarlierLanding,
  getLeadAttributionRow,
  isSameAttribution,
  type Attribution,
} from "@/lib/tracking/attribution";

const LANDED_AT = 1727265600000;
const GCLID = "Cj0KCQjwabc123_XYZ";
const FBCLID = "IwAR1abcdefghij";
const DAY_MS = 24 * 60 * 60 * 1000;
const AD_CLICK: Attribution = { gclid: GCLID, utm_source: "google", landingPath: "/contact", landedAt: LANDED_AT };

/** The cookie's value and Max-Age, read back from a Set-Cookie string. */
function getCookieParts(cookieString: string | null): { value: string; maxAge: number } | null {
  if (!cookieString) return null;
  const value = cookieString.slice("cwr_attribution=".length, cookieString.indexOf(";"));
  return { value, maxAge: Number(/Max-Age=(\d+)/.exec(cookieString)?.[1]) };
}

describe("getAttributionFromUrl", () => {
  it("keeps click IDs, campaign tags, and the landing page", () => {
    // Arrange
    const url = new URL(`https://www.charliewardrealty.com/listings?gclid=${GCLID}&utm_source=google&utm_campaign=Spring%20homes&other=1`);

    // Act
    const attribution = getAttributionFromUrl({ url, landedAt: LANDED_AT });

    // Assert
    expect(attribution).toEqual({ gclid: GCLID, utm_source: "google", utm_campaign: "Spring homes", landingPath: "/listings", landedAt: LANDED_AT });
  });

  it("returns nothing for a link without ad details", () => {
    // Arrange
    const url = new URL("https://www.charliewardrealty.com/team?page=2");

    // Act
    const attribution = getAttributionFromUrl({ url, landedAt: LANDED_AT });

    // Assert
    expect(attribution).toBeNull();
  });

  it("drops click IDs with unexpected characters or lengths", () => {
    // Arrange
    const url = new URL(`https://www.charliewardrealty.com/?gclid=${encodeURIComponent("<script>")}&fbclid=short&utm_medium=${"x".repeat(101)}`);

    // Act
    const attribution = getAttributionFromUrl({ url, landedAt: LANDED_AT });

    // Assert
    expect(attribution).toBeNull();
  });
});

describe("getAttributionFromField", () => {
  it("accepts what the browser stored", () => {
    // Arrange
    const field = JSON.stringify({ fbclid: FBCLID, landingPath: "/", landedAt: LANDED_AT });

    // Act
    const attribution = getAttributionFromField(field);

    // Assert
    expect(attribution).toEqual({ fbclid: FBCLID, landingPath: "/", landedAt: LANDED_AT });
  });

  it.each(["", "{", JSON.stringify({ gclid: "bad id!", landingPath: "/", landedAt: LANDED_AT }), JSON.stringify({ landingPath: "https://evil.example", landedAt: LANDED_AT })])("rejects a tampered field (%s)", (field) => {
    // Arrange / Act
    const attribution = getAttributionFromField(field);

    // Assert
    expect(attribution).toBeNull();
  });
});

describe("getLeadAttributionRow", () => {
  it("builds Meta's click value from the landing link when the Pixel set none", () => {
    // Arrange
    const attribution = { fbclid: FBCLID, landingPath: "/contact", landedAt: LANDED_AT };

    // Act
    const row = getLeadAttributionRow({ attribution, fbc: null, fbp: null });

    // Assert
    expect(row?.fbc).toBe(`fb.1.${LANDED_AT}.${FBCLID}`);
  });

  it("prefers the Pixel's own click cookie", () => {
    // Arrange
    const attribution = { fbclid: FBCLID, landingPath: "/contact", landedAt: LANDED_AT };

    // Act
    const row = getLeadAttributionRow({ attribution, fbc: "fb.1.1700000000000.OtherClick12", fbp: null });

    // Assert
    expect(row?.fbc).toBe("fb.1.1700000000000.OtherClick12");
  });

  it("fills every column so the database never guesses", () => {
    // Arrange / Act
    const row = getLeadAttributionRow({ attribution: null, fbc: null, fbp: "fb.1.1727265600000.1234567890" });

    // Assert
    expect(Object.keys(row ?? {}).sort()).toEqual(["fbc", "fbp", "gbraid", "gclid", "landing_path", "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term", "wbraid"]);
  });

  it("still records advertising consent when the visitor came without an ad click", () => {
    // Arrange / Act
    const row = getLeadAttributionRow({ attribution: null, fbc: null, fbp: null });

    // Assert
    expect(Object.values(row).every((value) => value === null)).toBe(true);
  });
});

describe("the click cookie", () => {
  it("reads back the click cookie it wrote", () => {
    // Arrange
    const cookieString = getAttributionCookieString({ attribution: AD_CLICK, now: new Date(LANDED_AT + DAY_MS), isSecure: true });

    // Act
    const attribution = getAttributionFromCookie(getCookieParts(cookieString)?.value);

    // Assert
    expect(attribution).toEqual(AD_CLICK);
  });

  it("drops a forged or broken click cookie", () => {
    // Arrange
    const values = [encodeURIComponent(JSON.stringify({ ...AD_CLICK, gclid: "<script>" })), "%E0%A4%A", encodeURIComponent("not json"), undefined];

    // Act
    const attributions = values.map(getAttributionFromCookie);

    // Assert
    expect(attributions).toEqual([null, null, null, null]);
  });

  it("lasts until 90 days after the ad click", () => {
    // Arrange
    const tenDaysLater = new Date(LANDED_AT + 10 * DAY_MS);

    // Act
    const cookieString = getAttributionCookieString({ attribution: AD_CLICK, now: tenDaysLater, isSecure: true });

    // Assert
    expect({ maxAge: getCookieParts(cookieString)?.maxAge, isSecure: cookieString?.endsWith("; Secure") }).toEqual({ maxAge: 80 * 24 * 60 * 60, isSecure: true });
  });

  it("is not written for an ad click older than 90 days", () => {
    // Act
    const cookieString = getAttributionCookieString({ attribution: AD_CLICK, now: new Date(LANDED_AT + 90 * DAY_MS), isSecure: true });

    // Assert
    expect(cookieString).toBeNull();
  });

  it("drops campaign tags to stay under the cookie size limit", () => {
    // Arrange
    const longTags = { utm_source: "s".repeat(100), utm_medium: "m".repeat(100), utm_campaign: "\u4e2d".repeat(100), utm_term: "\u4e2d".repeat(100), utm_content: "\u4e2d".repeat(100) };
    const attribution: Attribution = { ...AD_CLICK, ...longTags, fbclid: FBCLID, landingPath: `/${"\u4e2d".repeat(254)}` };

    // Act
    const kept = getAttributionFromCookie(getCookieParts(getAttributionCookieString({ attribution, now: new Date(LANDED_AT), isSecure: false }))?.value);

    // Assert
    expect(kept).toEqual({ gclid: GCLID, fbclid: FBCLID, landingPath: attribution.landingPath, landedAt: LANDED_AT });
  });

  it("writes no cookie when even the click IDs are too long", () => {
    // Arrange
    const attribution: Attribution = { gclid: "g".repeat(4000), landingPath: "/", landedAt: LANDED_AT };

    // Act
    const cookieString = getAttributionCookieString({ attribution, now: new Date(LANDED_AT), isSecure: true });

    // Assert
    expect(cookieString).toBeNull();
  });
});

describe("getEarlierLanding", () => {
  it("keeps the first landing time for the same ad click", () => {
    // Arrange
    const reloaded: Attribution = { gclid: GCLID, landingPath: "/about", landedAt: LANDED_AT + DAY_MS };

    // Act
    const landing = getEarlierLanding(AD_CLICK, reloaded);

    // Assert
    expect(landing).toEqual(AD_CLICK);
  });
});

describe("isSameAttribution", () => {
  it("treats the same ad click as already stored", () => {
    // Arrange
    const reloaded: Attribution = { gclid: GCLID, landingPath: "/about", landedAt: LANDED_AT + DAY_MS };

    // Act
    const isSame = isSameAttribution(AD_CLICK, getEarlierLanding(AD_CLICK, reloaded));

    // Assert
    expect(isSame).toBe(true);
  });
});

describe("getAddressWithClickIds", () => {
  const LANDING: Attribution = { gclid: GCLID, fbclid: FBCLID, utm_source: "google", utm_campaign: "Spring", landingPath: "/", landedAt: LANDED_AT };

  it("adds the landing click IDs back to an address that lost them", () => {
    // Act
    const address = getAddressWithClickIds({ href: "https://www.charliewardrealty.com/about", attribution: LANDING });

    // Assert
    expect(address).toBe(`https://www.charliewardrealty.com/about?gclid=${GCLID}&fbclid=${FBCLID}`);
  });

  it("leaves an address that already has its click IDs unchanged", () => {
    // Act
    const address = getAddressWithClickIds({ href: `https://www.charliewardrealty.com/?gclid=${GCLID}&fbclid=${FBCLID}`, attribution: LANDING });

    // Assert
    expect(address).toBeNull();
  });

  it("brings back no campaign tags", () => {
    // Act
    const address = getAddressWithClickIds({ href: "https://www.charliewardrealty.com/about", attribution: LANDING }) ?? "";

    // Assert
    expect(new URL(address).searchParams.has("utm_source") || new URL(address).searchParams.has("utm_campaign")).toBe(false);
  });

  it("keeps every other parameter and the page anchor", () => {
    // Act
    const address = getAddressWithClickIds({ href: "https://www.charliewardrealty.com/listings?city=High%20Point&beds=3+&gclid=other_click_1234#map", attribution: LANDING });

    // Assert
    expect(address).toBe(`https://www.charliewardrealty.com/listings?city=High%20Point&beds=3+&gclid=other_click_1234&fbclid=${FBCLID}#map`);
  });
});
