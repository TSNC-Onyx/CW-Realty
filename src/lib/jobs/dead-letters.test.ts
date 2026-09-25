import { describe, expect, it } from "vitest";

import { getRetryDelaySeconds } from "@/lib/jobs/dead-letters";

describe("retry timing", () => {
  it("waits longer after each failure, up to an hour", () => {
    // Arrange
    const attempts = [1, 2, 3, 4, 10];

    // Act
    const delays = attempts.map(getRetryDelaySeconds);

    // Assert
    expect(delays).toEqual([60, 120, 240, 480, 3600]);
  });
});
