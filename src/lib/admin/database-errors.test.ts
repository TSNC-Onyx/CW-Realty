import { describe, expect, it } from "vitest";

import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";

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
