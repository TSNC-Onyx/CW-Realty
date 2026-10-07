import { afterEach, describe, expect, it, vi } from "vitest";

import { isOutdatedBotCheckKey, isTestSiteKey } from "@/lib/security/bot-check-key";

describe("which Quick Check key a page was built with", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["the key this deployment was built with", "0x4AAAA-current", false],
    ["an older key", "1x00000000000000000000AA", true],
    ["no key (a page from before this release)", "", false],
    ["nothing at all", null, false],
  ])("treats %s correctly", (_label, pageKey, expected) => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAA-current");

    // Act
    const isOutdated = isOutdatedBotCheckKey(pageKey);

    // Assert
    expect(isOutdated).toBe(expected);
  });

  it("never calls a page out of date in local development without a key", () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");

    // Act
    const isOutdated = isOutdatedBotCheckKey("0x4AAAA-anything");

    // Assert
    expect(isOutdated).toBe(false);
  });

  it.each([
    ["always-pass", "1x00000000000000000000AA", true],
    ["always-block", "2x00000000000000000000AB", true],
    ["always-ask", "3x00000000000000000000FF", true],
    ["a real key", "0x4AAAAAAFMVi5AgjSczB16y", false],
  ])("recognises Cloudflare's %s test key", (_label, siteKey, expected) => {
    // Act
    const isTest = isTestSiteKey(siteKey);

    // Assert
    expect(isTest).toBe(expected);
  });
});
