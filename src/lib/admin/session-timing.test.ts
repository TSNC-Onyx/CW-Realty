import { describe, expect, it } from "vitest";

import { ABSOLUTE_LIMIT_MS, IDLE_LIMIT_MS, getLastActivityAtMs, getLatestAuthAtMs, getSignedInAtMs, isSessionExpired } from "@/lib/admin/session-timing";

const NOW_MS = 1_800_000_000_000;

describe("admin session limits (30 minutes idle, 12 hours total)", () => {
  it("keeps a session that was active a minute ago", () => {
    // Arrange
    const times = { signedInAtMs: NOW_MS - 60 * 60 * 1000, lastActivityAtMs: NOW_MS - 60 * 1000, nowMs: NOW_MS };

    // Act
    const isExpired = isSessionExpired(times);

    // Assert
    expect(isExpired).toBe(false);
  });

  it("ends a session idle for more than 30 minutes", () => {
    // Arrange
    const times = { signedInAtMs: NOW_MS - 60 * 60 * 1000, lastActivityAtMs: NOW_MS - IDLE_LIMIT_MS - 1, nowMs: NOW_MS };

    // Act
    const isExpired = isSessionExpired(times);

    // Assert
    expect(isExpired).toBe(true);
  });

  it("ends a busy session 12 hours after sign-in", () => {
    // Arrange
    const times = { signedInAtMs: NOW_MS - ABSOLUTE_LIMIT_MS - 1, lastActivityAtMs: NOW_MS, nowMs: NOW_MS };

    // Act
    const isExpired = isSessionExpired(times);

    // Assert
    expect(isExpired).toBe(true);
  });

  it("treats an unknown last activity as expired, so a lost cookie never extends a session", () => {
    // Arrange
    const times = { signedInAtMs: NOW_MS - 45 * 60 * 1000, lastActivityAtMs: null, nowMs: NOW_MS };

    // Act
    const isExpired = isSessionExpired(times);

    // Assert
    expect(isExpired).toBe(true);
  });

  it("uses the latest sign-in step as activity right after signing in", () => {
    // Arrange
    const authMethods = [{ method: "password", timestamp: (NOW_MS - 60_000) / 1000 }, { method: "totp", timestamp: (NOW_MS - 5_000) / 1000 }];
    const times = { signedInAtMs: getSignedInAtMs(authMethods), lastActivityAtMs: getLatestAuthAtMs(authMethods), nowMs: NOW_MS };

    // Act
    const isExpired = isSessionExpired(times);

    // Assert
    expect(isExpired).toBe(false);
  });

  it("ends a session signed in 45 minutes ago whose activity cookie was lost", () => {
    // Arrange
    const authMethods = [{ method: "password", timestamp: (NOW_MS - 45 * 60 * 1000) / 1000 }];
    const times = { signedInAtMs: getSignedInAtMs(authMethods), lastActivityAtMs: getLatestAuthAtMs(authMethods), nowMs: NOW_MS };

    // Act
    const isExpired = isSessionExpired(times);

    // Assert
    expect(isExpired).toBe(true);
  });

  it("reads the sign-in time from the earliest step in the signed token", () => {
    // Arrange
    const authMethods = [{ method: "totp", timestamp: 1_800_000_100 }, { method: "password", timestamp: 1_800_000_000 }];

    // Act
    const signedInAtMs = getSignedInAtMs(authMethods);

    // Assert
    expect(signedInAtMs).toBe(1_800_000_000_000);
  });

  it.each([undefined, "", "abc", "-5"])("ignores an unreadable activity cookie (%s)", (cookieValue) => {
    // Arrange
    const value = cookieValue;

    // Act
    const lastActivityAtMs = getLastActivityAtMs(value);

    // Assert
    expect(lastActivityAtMs).toBeNull();
  });
});
