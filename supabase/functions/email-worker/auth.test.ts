import { describe, expect, it } from "vitest";

import { getBearerToken, isSameSecret } from "./auth.ts";

describe("wake-up secret check", () => {
  it("accepts the right secret", async () => {
    // Act
    const isAllowed = await isSameSecret("local-secret", "local-secret");

    // Assert
    expect(isAllowed).toBe(true);
  });

  it.each(["", "local-secre", "local-secret-x", "LOCAL-SECRET"])("refuses %j", async (given) => {
    // Act
    const isAllowed = await isSameSecret(given, "local-secret");

    // Assert
    expect(isAllowed).toBe(false);
  });

  it("refuses everything when no secret is set up", async () => {
    // Act
    const isAllowed = await isSameSecret("", "");

    // Assert
    expect(isAllowed).toBe(false);
  });

  it("reads only a Bearer header", () => {
    // Act
    const tokens = [getBearerToken("Bearer abc"), getBearerToken("Basic abc"), getBearerToken(null)];

    // Assert
    expect(tokens).toEqual(["abc", "", ""]);
  });
});
