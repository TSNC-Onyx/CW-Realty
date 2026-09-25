import { describe, expect, it } from "vitest";

import { isDeadLetterQueue } from "@/lib/jobs/alert-jobs";

describe("isDeadLetterQueue", () => {
  it("recognizes the dead-letter queues of production and preview", () => {
    // Arrange
    const queueNames = ["cwr-alerts-dlq", "cwr-alerts-preview-dlq"];

    // Act
    const results = queueNames.map(isDeadLetterQueue);

    // Assert
    expect(results).toEqual([true, true]);
  });

  it("treats the main alert queues as live queues", () => {
    // Arrange
    const queueNames = ["cwr-alerts", "cwr-alerts-preview"];

    // Act
    const results = queueNames.map(isDeadLetterQueue);

    // Assert
    expect(results).toEqual([false, false]);
  });
});
