import { afterEach, describe, expect, it, vi } from "vitest";

import { isCheckTimerRunning, isLastingWidgetError, isTokenFresh } from "@/components/forms/use-bot-check";

const NOW = 1_000_000_000;

describe("whether a Quick Check token can still be sent", () => {
  it.each([
    ["no token yet", null, false],
    ["a token from a minute ago", NOW - 60_000, true],
    ["a token from 4½ minutes ago (the safety margin)", NOW - 270_000, false],
    ["a token from after a laptop slept overnight", NOW - 8 * 60 * 60 * 1000, false],
  ])("decides for %s", (_label, tokenAt, expected) => {
    // Act
    const isFresh = isTokenFresh({ tokenAt, now: NOW });

    // Assert
    expect(isFresh).toBe(expected);
  });
});

describe("what a production page reports about its Quick Check key", () => {
  async function loadSetupProblemCode() {
    vi.resetModules();
    return (await import("@/components/forms/use-bot-check")).getSetupProblemCode;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports a production page built with Cloudflare's test key", async () => {
    // Arrange
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_TURNSTILE_TEST_KEYS", "");
    const getSetupProblemCode = await loadSetupProblemCode();

    // Act
    const code = getSetupProblemCode("1x00000000000000000000AA");

    // Assert
    expect(code).toBe("test_site_key");
  });

  it("reports a production page built with no key at all", async () => {
    // Arrange
    vi.stubEnv("NODE_ENV", "production");
    const getSetupProblemCode = await loadSetupProblemCode();

    // Act
    const code = getSetupProblemCode(null);

    // Assert
    expect(code).toBe("missing_site_key");
  });

  it("stays quiet for local previews and tests that opt in to test keys", async () => {
    // Arrange
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_TURNSTILE_TEST_KEYS", "true");
    const getSetupProblemCode = await loadSetupProblemCode();

    // Act
    const code = getSetupProblemCode("1x00000000000000000000AA");

    // Assert
    expect(code).toBeNull();
  });

  it("stays quiet with a real key", async () => {
    // Arrange
    vi.stubEnv("NODE_ENV", "production");
    const getSetupProblemCode = await loadSetupProblemCode();

    // Act
    const code = getSetupProblemCode("0x4AAAAAAFMVi5AgjSczB16y");

    // Assert
    expect(code).toBeNull();
  });
});

describe("which Quick Check errors are real", () => {
  it.each([
    ["a first glitch Cloudflare retries by itself", "300030", false, false],
    ["a first visitor-side clock problem", "200100", false, false],
    ["the same kind of glitch a second time in a row", "300030", true, true],
    ["a site key set up wrong", "110100", false, true],
    ["a domain that isn't allowed", "110200", false, true],
    ["a disabled site key", "400070", false, true],
  ])("decides for %s", (_label, errorCode, hasErroredBefore, expected) => {
    // Act
    const isLasting = isLastingWidgetError({ errorCode, hasErroredBefore });

    // Assert
    expect(isLasting).toBe(expected);
  });
});

describe("when the Quick Check's 10-second limit counts", () => {
  it.each([
    ["a check running in view", { isEnabled: true, status: "checking", isVisible: true }, true],
    ["a check in a background tab", { isEnabled: true, status: "checking", isVisible: false }, false],
    ["a tick box waiting for the person", { isEnabled: true, status: "needs_click", isVisible: true }, false],
    ["a check that already passed", { isEnabled: true, status: "ready", isVisible: true }, false],
    ["a form that doesn't show the check", { isEnabled: false, status: "checking", isVisible: true }, false],
  ] as const)("decides for %s", (_label, state, expected) => {
    // Act
    const isRunning = isCheckTimerRunning(state);

    // Assert
    expect(isRunning).toBe(expected);
  });
});

