import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyTurnstileToken } from "@/lib/security/turnstile";

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
