import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { getFormConversion, scheduleMetaLead, type LeadTracking } from "@/lib/tracking/lead-tracking";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));

const CONTACT = { email: "Jordan@Example.com", phone: "+13365550123" };
const NO_ADS: LeadTracking = { isAdsAllowed: false, attributionRow: null, fbc: null, fbp: null, sourceUrl: null, userAgent: null };
const VISITOR = { ip: "203.0.113.1", hostname: "www.charliewardrealty.com" };

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
