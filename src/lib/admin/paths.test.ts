import { describe, expect, it } from "vitest";

import { getSafeAdminPath, isAdminPath, isPublicAdminPath } from "@/lib/admin/paths";

describe("getSafeAdminPath", () => {
  it.each([
    ["/admin/listings", "/admin/listings"],
    ["/admin/team/abc?created=1", "/admin/team/abc?created=1"],
    [undefined, "/admin"],
    ["https://evil.example/admin", "/admin"],
    ["//evil.example/admin", "/admin"],
    ["/administrator", "/admin"],
    ["/admin\\evil", "/admin"],
    ["/contact", "/admin"],
  ])("%s → %s (no open redirects)", (next, expected) => {
    // Arrange
    const input = next;

    // Act
    const safePath = getSafeAdminPath(input);

    // Assert
    expect(safePath).toBe(expected);
  });
});

describe("admin path checks", () => {
  it("recognizes the admin area without matching look-alike paths", () => {
    // Arrange
    const paths = ["/admin", "/admin/team", "/administrator", "/about"];

    // Act
    const results = paths.map(isAdminPath);

    // Assert
    expect(results).toEqual([true, true, false, false]);
  });

  it("lets only the sign-in steps through without a session", () => {
    // Arrange
    const paths = ["/admin/login", "/admin/forgot-password", "/admin/auth/confirm", "/admin/logout", "/admin", "/admin/set-password"];

    // Act
    const results = paths.map(isPublicAdminPath);

    // Assert
    expect(results).toEqual([true, true, true, true, false, false]);
  });
});
