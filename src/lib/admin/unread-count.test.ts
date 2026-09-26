import { describe, expect, it } from "vitest";

import { getUnreadBadgeText, getUnreadSpokenText } from "@/lib/admin/unread-count";

describe("getUnreadBadgeText", () => {
  it("shows small counts as they are", () => {
    // Arrange
    const count = 3;

    // Act
    const text = getUnreadBadgeText(count);

    // Assert
    expect(text).toBe("3");
  });

  it("caps large counts at 99+", () => {
    // Arrange
    const count = 128;

    // Act
    const text = getUnreadBadgeText(count);

    // Assert
    expect(text).toBe("99+");
  });
});

describe("getUnreadSpokenText", () => {
  it("names the full count for screen readers", () => {
    // Arrange
    const count = 128;

    // Act
    const text = getUnreadSpokenText(count);

    // Assert
    expect(text).toBe("(128 new)");
  });

  it("says nothing when no message is waiting", () => {
    // Arrange
    const count = 0;

    // Act
    const text = getUnreadSpokenText(count);

    // Assert
    expect(text).toBe("");
  });
});
