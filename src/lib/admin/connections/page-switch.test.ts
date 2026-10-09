import { describe, expect, it } from "vitest";

import { getIsConnectionsPageMentioned } from "@/lib/admin/connections/page-switch";

describe("getIsConnectionsPageMentioned", () => {
  it("finds the page by name or by its address", () => {
    // Arrange
    const bodies = ["Ask us, or see our Connections page for lenders.", "Partners are listed at charliewardrealty.com/connections."];

    // Act
    const results = bodies.map(getIsConnectionsPageMentioned);

    // Assert
    expect(results).toEqual([true, true]);
  });

  it("ignores the word connections when it isn't about the page", () => {
    // Arrange
    const body = "We have strong local connections across the Triad.";

    // Act
    const result = getIsConnectionsPageMentioned(body);

    // Assert
    expect(result).toBe(false);
  });
});
