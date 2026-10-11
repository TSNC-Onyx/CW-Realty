import { describe, expect, it } from "vitest";

import { newPasswordSchema } from "@/lib/admin/auth-schemas";

describe("password rules", () => {
  it("accepts a long mixed password typed the same twice", () => {
    // Arrange
    const values = { password: "Greensboro-Homes-2026", confirmPassword: "Greensboro-Homes-2026" };

    // Act
    const result = newPasswordSchema.safeParse(values);

    // Assert
    expect(result.success).toBe(true);
  });

  it("accepts an 8-character password with both cases and a number (owner choice 2026-10-09)", () => {
    // Arrange
    const values = { password: "Short1Ab", confirmPassword: "Short1Ab" };

    // Act
    const result = newPasswordSchema.safeParse(values);

    // Assert
    expect(result.success).toBe(true);
  });

  it.each([
    ["Short1A", "Use at least 8 characters"],
    ["lower123", "Include an uppercase letter"],
    ["UPPER123", "Include a lowercase letter"],
    ["NoNumber", "Include a number"],
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
