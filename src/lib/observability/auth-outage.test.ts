import { AuthApiError, AuthInvalidJwtError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { getAuthErrorCode, isAuthOutage } from "@/lib/observability/auth-outage";

describe("sign-in outage classifier", () => {
  it("treats a network failure as an outage", () => {
    // Arrange
    const error = new AuthRetryableFetchError("fetch failed", 0);

    // Act
    const isOutage = isAuthOutage(error);

    // Assert
    expect(isOutage).toBe(true);
  });

  it("treats an upstream server error as an outage", () => {
    // Arrange
    const error = new AuthApiError("Internal error", 503, "unexpected_failure");

    // Act
    const isOutage = isAuthOutage(error);

    // Assert
    expect(isOutage).toBe(true);
  });

  it("treats an unreadable upstream reply as an outage", () => {
    // Arrange
    const error = new AuthUnknownError("Auth failed", new SyntaxError("Unexpected token <"));

    // Act
    const isOutage = isAuthOutage(error);

    // Assert
    expect(isOutage).toBe(true);
  });

  it.each([
    ["an expired or bad signature", new AuthInvalidJwtError("Invalid JWT signature")],
    ["a missing session", new AuthSessionMissingError()],
    ["a revoked refresh token", new AuthApiError("Invalid Refresh Token", 400, "refresh_token_already_used")],
    ["a rejected token", new AuthApiError("Unauthorized", 401, "bad_jwt")],
  ])("treats %s as signed out", (_label, error) => {
    // Act
    const isOutage = isAuthOutage(error);

    // Assert
    expect(isOutage).toBe(false);
  });

  it("treats a forged token that breaks the verifier as signed out", () => {
    // Arrange: auth-js throws a plain Error for an unsupported algorithm.
    const error = new Error("Invalid alg claim");

    // Act
    const isOutage = isAuthOutage(error);

    // Assert
    expect(isOutage).toBe(false);
  });

  it("names an auth error by its code", () => {
    // Arrange
    const error = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");

    // Act
    const code = getAuthErrorCode(error);

    // Assert
    expect(code).toBe("invalid_credentials");
  });
});
