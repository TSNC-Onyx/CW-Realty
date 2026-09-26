import { describe, expect, it } from "vitest";

import { getAttributionFromField, getAttributionFromUrl, getLeadAttributionRow } from "@/lib/tracking/attribution";

const LANDED_AT = 1727265600000;
const GCLID = "Cj0KCQjwabc123_XYZ";
const FBCLID = "IwAR1abcdefghij";

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

  it("saves nothing when there is nothing to save", () => {
    // Arrange / Act
    const row = getLeadAttributionRow({ attribution: null, fbc: null, fbp: null });

    // Assert
    expect(row).toBeNull();
  });
});
