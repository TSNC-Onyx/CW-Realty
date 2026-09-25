import { describe, expect, it } from "vitest";

import { mfaCodeSchema, newPasswordSchema } from "@/lib/admin/auth-schemas";

describe("password rules", () => {
  it("accepts a long mixed password typed the same twice", () => {
    // Arrange
    const values = { password: "Greensboro-Homes-2026", confirmPassword: "Greensboro-Homes-2026" };

    // Act
    const result = newPasswordSchema.safeParse(values);

    // Assert
    expect(result.success).toBe(true);
  });

  it.each([
    ["Short1A", "Use at least 12 characters"],
    ["alllowercase123", "Include an uppercase letter"],
    ["NoNumbersHereAtAll", "Include a number"],
  ])("explains what %s is missing", (password, message) => {
    // Arrange
    const values = { password, confirmPassword: password };

    // Act
    const result = newPasswordSchema.safeParse(values);

    // Assert
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toContain(message);
  });

  it("notices when the two passwords differ", () => {
    // Arrange
    const values = { password: "Greensboro-Homes-2026", confirmPassword: "Greensboro-Homes-2027" };

    // Act
    const result = newPasswordSchema.safeParse(values);

    // Assert
    expect(result.success ? "" : result.error.issues[0]?.message).toBe("The two passwords don't match");
  });
});

describe("sign-in code", () => {
  it.each([
    ["123456", true],
    ["123 456", true],
    ["12345", false],
    ["abcdef", false],
  ])("%s → %s", (code, expected) => {
    // Arrange
    const input = code;

    // Act
    const result = mfaCodeSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(expected);
  });
});
