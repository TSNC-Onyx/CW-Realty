import { afterEach, describe, expect, it, vi } from "vitest";

import { checkTurnstileToken, verifyTurnstileToken } from "@/lib/security/turnstile";

vi.mock("server-only", () => ({}));

const CHECK = { token: "", remoteIp: null, expectedAction: "contact-form", expectedHostname: "www.charliewardrealty.com" };

function stubSiteverify(reply: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(reply), { status })));
}

describe("verifyTurnstileToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("accepts a token Cloudflare confirms", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    stubSiteverify({ success: true, action: "contact-form", hostname: "www.charliewardrealty.com" });

    // Act
    const isHuman = await verifyTurnstileToken({ ...CHECK, token: "token", remoteIp: "203.0.113.1" });

    // Assert
    expect(isHuman).toBe(true);
  });

  it("rejects a token solved on another site or for another form", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    stubSiteverify({ success: true, action: "contact-form", hostname: "evil.example" });

    // Act
    const isHuman = await verifyTurnstileToken({ ...CHECK, token: "token" });

    // Assert
    expect(isHuman).toBe(false);
  });

  it("does not crash on an unreadable reply", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>oops</html>", { status: 200 })));

    // Act
    const isHuman = await verifyTurnstileToken({ ...CHECK, token: "token" });

    // Assert
    expect(isHuman).toBe(false);
  });

  it("rejects a token Cloudflare refuses, and a missing token", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    stubSiteverify({ success: false, "error-codes": ["timeout-or-duplicate"] });

    // Act
    const results = [await verifyTurnstileToken({ ...CHECK, token: "used" }), await verifyTurnstileToken(CHECK)];

    // Assert
    expect(results).toEqual([false, false]);
  });

  it("fails closed in production when the secret is missing", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");

    // Act
    const isHuman = await verifyTurnstileToken({ ...CHECK, token: "token" });

    // Assert
    expect(isHuman).toBe(false);
  });

  it("treats a network failure as not verified", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    // Act
    const isHuman = await verifyTurnstileToken({ ...CHECK, token: "token" });

    // Assert
    expect(isHuman).toBe(false);
  });
});

describe("checkTurnstileToken reasons", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ["a secret Cloudflare doesn't recognise", ["invalid-input-secret"], "not_configured"],
    ["a token that was already used or is too old", ["timeout-or-duplicate"], "expired"],
    ["a token Cloudflare refuses", ["invalid-input-response"], "rejected"],
    ["a missing token", ["missing-input-response"], "no_token"],
    ["an unknown refusal", ["something-new"], "rejected"],
  ])("names %s", async (_label, errorCodes, reason) => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    stubSiteverify({ success: false, "error-codes": errorCodes });

    // Act
    const result = await checkTurnstileToken({ ...CHECK, token: "token" });

    // Assert
    expect(result.reason).toBe(reason);
  });

  it("refuses a token made for another form on this site", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    stubSiteverify({ success: true, action: "chat", hostname: "www.charliewardrealty.com" });

    // Act
    const result = await checkTurnstileToken({ ...CHECK, token: "token" });

    // Assert
    expect(result.reason).toBe("wrong_site");
  });

  it("asks Cloudflare once more, with the same idempotency key, after a server error", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, action: "contact-form", hostname: "www.charliewardrealty.com" })));
    vi.stubGlobal("fetch", fetchMock);

    // Act
    await checkTurnstileToken({ ...CHECK, token: "token" });

    // Assert
    const keys = fetchMock.mock.calls.map(([, init]) => new URLSearchParams((init as RequestInit).body as URLSearchParams).get("idempotency_key"));
    expect(keys).toEqual([expect.any(String), keys[0]]);
  });

  it("stops after two tries and says Cloudflare couldn't be reached", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    // Act
    const result = await checkTurnstileToken({ ...CHECK, token: "token" });

    // Assert
    expect({ reason: result.reason, tries: fetchMock.mock.calls.length }).toEqual({ reason: "unreachable", tries: 2 });
  });

  it("gives up on a slow answer instead of waiting forever", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, action: "contact-form" })));
    vi.stubGlobal("fetch", fetchMock);

    // Act
    await checkTurnstileToken({ ...CHECK, token: "token" });

    // Assert
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses everything when production was built with a test site key", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // Act
    const result = await checkTurnstileToken({ ...CHECK, token: "XXXX.DUMMY.TOKEN.XXXX" });

    // Assert
    expect({ reason: result.reason, asked: fetchMock.mock.calls.length }).toEqual({ reason: "test_key_in_production", asked: 0 });
  });

  it("refuses a test secret's answer in production", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAA-real-key");
    stubSiteverify({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } });

    // Act
    const result = await checkTurnstileToken({ ...CHECK, token: "token" });

    // Assert
    expect(result.reason).toBe("test_key_in_production");
  });

  it("treats a forged test token on a site with real keys as an ordinary refusal", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAA-real-key");
    stubSiteverify({ success: false, "error-codes": ["invalid-input-response"] });

    // Act
    const result = await checkTurnstileToken({ ...CHECK, token: "XXXX.DUMMY.TOKEN.XXXX" });

    // Assert
    expect(result.reason).toBe("rejected");
  });

  it("lets local previews and automated tests use test keys when they opt in", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ALLOW_TURNSTILE_TEST_KEYS", "true");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    stubSiteverify({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } });

    // Act
    const result = await checkTurnstileToken({ ...CHECK, token: "XXXX.DUMMY.TOKEN.XXXX" });

    // Assert
    expect(result.reason).toBe("passed");
  });

  it("skips the check in local development when no secret is set", async () => {
    // Arrange
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "development");

    // Act
    const result = await checkTurnstileToken(CHECK);

    // Assert
    expect(result.reason).toBe("passed");
  });
});
