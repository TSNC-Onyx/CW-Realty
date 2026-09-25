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
