import { describe, expect, it } from "vitest";

import { getProblemAlertOutcome } from "@/lib/jobs/problem-alerts";

describe("problem-alert digest outcome", () => {
  it("is sent once every email went out or can never go out", () => {
    // Act
    const outcome = getProblemAlertOutcome({ statuses: ["sent", "failed"], retryableCount: 0 });

    // Assert
    expect(outcome).toBe("sent");
  });

  it("is retried while a retry could help", () => {
    // Act
    const outcome = getProblemAlertOutcome({ statuses: ["sent", "failed"], retryableCount: 1 });

    // Assert
    expect(outcome).toBe("failed");
  });

  it("is refused when no email went out and none can, such as a revoked email key", () => {
    // Act
    const outcome = getProblemAlertOutcome({ statuses: ["failed", "failed"], retryableCount: 0 });

    // Assert
    expect(outcome).toBe("refused");
  });

  it("is not sent when email sending is not set up", () => {
    // Act
    const outcome = getProblemAlertOutcome({ statuses: ["not_sent"], retryableCount: 0 });

    // Assert
    expect(outcome).toBe("not_sent");
  });
});
