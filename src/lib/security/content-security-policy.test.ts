import { describe, expect, it } from "vitest";

import { createNonce, getContentSecurityPolicy } from "./content-security-policy";

const NONCE = "dGVzdC1ub25jZQ==";
const SUPABASE_ORIGIN = "https://example.supabase.co";

function getDirective(policy: string, name: string): string | undefined {
  return policy.split("; ").find((directive) => directive.startsWith(`${name} `));
}

describe("getContentSecurityPolicy", () => {
  it("allows only nonce-tagged scripts in production", () => {
    // Arrange
    const options = { nonce: NONCE, isDevelopment: false };

    // Act
    const policy = getContentSecurityPolicy(options);

    // Assert
    expect(getDirective(policy, "script-src")).toBe(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`);
  });

  it("never allows unsafe-inline or unsafe-eval in production", () => {
    // Arrange
    const options = { nonce: NONCE, isDevelopment: false, supabaseOrigin: SUPABASE_ORIGIN };

    // Act
    const policy = getContentSecurityPolicy(options);

    // Assert
    expect(policy).not.toMatch(/unsafe-(inline|eval)/);
  });

  it("blocks framing and plugins", () => {
    // Arrange
    const options = { nonce: NONCE, isDevelopment: false };

    // Act
    const policy = getContentSecurityPolicy(options);

    // Assert
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
  });

  it("adds the Supabase origin to connect and image sources", () => {
    // Arrange
    const options = { nonce: NONCE, isDevelopment: false, supabaseOrigin: SUPABASE_ORIGIN };

    // Act
    const policy = getContentSecurityPolicy(options);

    // Assert
    expect(getDirective(policy, "connect-src")).toBe(`connect-src 'self' ${SUPABASE_ORIGIN}`);
    expect(getDirective(policy, "img-src")).toBe(`img-src 'self' blob: data: ${SUPABASE_ORIGIN}`);
  });

  it("relaxes script and style rules only in development", () => {
    // Arrange
    const options = { nonce: NONCE, isDevelopment: true };

    // Act
    const policy = getContentSecurityPolicy(options);

    // Assert
    expect(getDirective(policy, "script-src")).toContain("'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });
});

describe("createNonce", () => {
  it("returns a different base64 value on every call", () => {
    // Arrange
    const nonceCount = 50;

    // Act
    const nonces = Array.from({ length: nonceCount }, createNonce);

    // Assert
    expect(new Set(nonces).size).toBe(nonceCount);
    expect(nonces.every((nonce) => /^[A-Za-z0-9+/]+=*$/.test(nonce))).toBe(true);
  });
});

describe("getContentSecurityPolicy with trackers (Phase 6)", () => {
  it("lets public pages send measurements to Google and Meta after consent", () => {
    // Arrange
    const options = { nonce: NONCE, isDevelopment: false, allowTrackers: true };

    // Act
    const policy = getContentSecurityPolicy(options);

    // Assert
    expect(getDirective(policy, "connect-src")).toBe(
      "connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.google.com https://*.g.doubleclick.net https://www.googleadservices.com https://pagead2.googlesyndication.com https://www.facebook.com https://*.analytics.google.com https://ad.doubleclick.net https://connect.facebook.net",
    );
  });

  it("keeps trackers out of admin pages", () => {
    // Arrange
    const options = { nonce: NONCE, isDevelopment: false, allowWebAssembly: true, tagServerOrigin: "https://data.example.com" };

    // Act
    const policy = getContentSecurityPolicy(options);

    // Assert
    expect(policy).not.toMatch(/google|facebook|data\.example\.com/);
  });

  it("allows the owner's server-side tagging address on public pages", () => {
    // Arrange
    const options = { nonce: NONCE, isDevelopment: false, allowTrackers: true, tagServerOrigin: "https://data.example.com" };

    // Act
    const policy = getContentSecurityPolicy(options);

    // Assert
    expect(getDirective(policy, "connect-src")).toContain("https://data.example.com");
  });

  it("still requires the nonce for every script when trackers are allowed", () => {
    // Arrange
    const options = { nonce: NONCE, isDevelopment: false, allowTrackers: true };

    // Act
    const policy = getContentSecurityPolicy(options);

    // Assert
    expect(getDirective(policy, "script-src")).toBe(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`);
  });
});
