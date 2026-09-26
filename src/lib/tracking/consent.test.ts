import { describe, expect, it } from "vitest";

import { CONSENT_COOKIE, CONSENT_VERSION, getAcceptAllConsent, getAllowedConsent, getConsentCookieString, getConsentFromCookie, hasAnyConsent } from "@/lib/tracking/consent";

const NOW = new Date("2026-09-25T12:00:00Z");

function getCookieValue(cookieString: string): string {
  return cookieString.split(";")[0]?.slice(`${CONSENT_COOKIE}=`.length) ?? "";
}

describe("consent cookie", () => {
  it("reads back the choice it wrote", () => {
    // Arrange
    const cookieString = getConsentCookieString({ choice: { analytics: true, ads: false }, now: NOW, isSecure: true });

    // Act
    const choice = getConsentFromCookie(getCookieValue(cookieString));

    // Assert
    expect(choice).toEqual({ analytics: true, ads: false });
  });

  it("is first-party, lasts 180 days, and is Secure on https", () => {
    // Arrange / Act
    const cookieString = getConsentCookieString({ choice: { analytics: false, ads: false }, now: NOW, isSecure: true });

    // Assert
    expect(cookieString).toMatch(/; Path=\/; Max-Age=15552000; SameSite=Lax; Secure$/);
  });

  it("asks again when the saved choice is from an older version", () => {
    // Arrange
    const oldValue = encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION - 1, analytics: true, ads: true, at: NOW.toISOString() }));

    // Act
    const choice = getConsentFromCookie(oldValue);

    // Assert
    expect(choice).toBeNull();
  });

  it.each(["", "not-json", "%E0%A4%A", encodeURIComponent('{"v":1,"analytics":"yes","ads":true}')])("treats a damaged cookie (%s) as no choice", (value) => {
    // Arrange / Act
    const choice = getConsentFromCookie(value);

    // Assert
    expect(choice).toBeNull();
  });
});

describe("Global Privacy Control", () => {
  it("keeps Advertising off even when the visitor accepts all", () => {
    // Arrange / Act
    const choice = getAcceptAllConsent({ isGpcOn: true });

    // Assert
    expect(choice).toEqual({ analytics: true, ads: false });
  });

  it("turns off Advertising saved before the signal was switched on", () => {
    // Arrange / Act
    const allowed = getAllowedConsent({ choice: { analytics: false, ads: true }, isGpcOn: true });

    // Assert
    expect(allowed).toEqual({ analytics: false, ads: false });
  });
});

describe("hasAnyConsent", () => {
  it.each([
    [null, false],
    [{ analytics: false, ads: false }, false],
    [{ analytics: true, ads: false }, true],
    [{ analytics: false, ads: true }, true],
  ])("for %j is %s", (choice, expected) => {
    // Arrange / Act
    const result = hasAnyConsent(choice);

    // Assert
    expect(result).toBe(expected);
  });
});
