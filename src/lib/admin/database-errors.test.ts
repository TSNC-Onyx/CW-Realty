import { describe, expect, it } from "vitest";

import { getDatabaseErrorMessage, getDatabaseProblemCause } from "@/lib/admin/database-errors";

describe("database error wording", () => {
  it("passes through messages written by our own database rules", () => {
    // Arrange
    const error = { code: "23514", message: "Add at least one photo before publishing this listing" };

    // Act
    const message = getDatabaseErrorMessage(error);

    // Assert
    expect(message).toBe("Add at least one photo before publishing this listing");
  });

  it("hides raw constraint details", () => {
    // Arrange
    const error = { code: "23514", message: 'new row for relation "listings" violates check constraint "listings_price_cents_check"' };

    // Act
    const message = getDatabaseErrorMessage(error);

    // Assert
    expect(message).not.toContain("violates");
  });

  it("explains a permission problem plainly", () => {
    // Arrange
    const error = { code: "42501", message: 'permission denied for table "memberships"' };

    // Act
    const message = getDatabaseErrorMessage(error);

    // Assert
    expect(message).toBe("Your role can't make this change.");
  });
});

describe("database error classification for the problem log", () => {
  it.each([
    ["one of our own rules", { code: "23514", message: "Add at least one photo before publishing this listing" }, "rule", "info"],
    ["a name already in use", { code: "23505", message: 'duplicate key value violates unique constraint "listings_slug_key"' }, "duplicate", "info"],
    ["a wrong role", { code: "42501", message: "permission denied for table memberships" }, "access", "warning"],
    ["a raw constraint the form should have caught", { code: "23514", message: 'new row for relation "listings" violates check constraint "x"' }, "database", "error"],
    ["an unknown database failure", { code: "XX000", message: "internal error" }, "database", "error"],
  ])("classifies %s", (_label, error, stage, severity) => {
    // Act
    const cause = getDatabaseProblemCause(error);

    // Assert
    expect({ stage: cause.stage, severity: cause.severity }).toEqual({ stage, severity });
  });
});
