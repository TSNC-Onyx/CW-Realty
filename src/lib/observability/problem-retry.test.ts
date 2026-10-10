import { describe, expect, it, vi } from "vitest";

import { getProblemRetryDelaySeconds, isProblemRetryJob, queueProblemRetry, storeRetriedProblem } from "@/lib/observability/problem-retry";

describe("keeping a problem through a database outage", () => {
  it.each([
    [1, 60],
    [2, 300],
    [3, 1800],
    [4, 7200],
    [5, 43_200],
    [9, 43_200],
  ])("waits the right time before retry %i", (attempt, expected) => {
    // Act
    const delay = getProblemRetryDelaySeconds(attempt);

    // Assert
    expect(delay).toBe(expected);
  });

  it("keeps the retries within the queue's 24-hour limit", () => {
    // Act
    const total = [1, 2, 3, 4, 5].reduce((sum, attempt) => sum + getProblemRetryDelaySeconds(attempt), 0);

    // Assert
    expect(total).toBeLessThan(24 * 60 * 60);
  });

  it("doesn't keep minor notes", async () => {
    // Arrange
    const queue = { send: vi.fn(async () => undefined) };

    // Act
    const isQueued = await queueProblemRetry({ queue, payload: { severity: "info" } });

    // Assert
    expect({ isQueued, sends: queue.send.mock.calls.length }).toEqual({ isQueued: false, sends: 0 });
  });

  it("says when the queue itself refused", async () => {
    // Arrange
    const queue = { send: vi.fn(async () => Promise.reject(new Error("over the daily allowance"))) };

    // Act
    const isQueued = await queueProblemRetry({ queue, payload: { severity: "error" } });

    // Assert
    expect(isQueued).toBe(false);
  });

  it("stops queuing after the day's budget is used", async () => {
    // Arrange
    const queue = { send: vi.fn(async () => undefined) };
    for (let index = 0; index < 300; index += 1) await queueProblemRetry({ queue, payload: { severity: "warning" } });

    // Act
    const isQueued = await queueProblemRetry({ queue, payload: { severity: "critical" } });

    // Assert
    expect(isQueued).toBe(false);
  });

  it("asks the queue to try again while the database still refuses", async () => {
    // Arrange
    const db = { rpc: async () => ({ data: null, error: { code: "PGRST000", message: "down" } }) };

    // Act
    const write = storeRetriedProblem({ db, job: { kind: "record_problem", payload: { id: "a" } } });

    // Assert
    await expect(write).rejects.toThrow("still unavailable");
  });

  it("tells a kept problem apart from an alert email job", () => {
    // Act
    const answers = [isProblemRetryJob({ kind: "record_problem", payload: {} }), isProblemRetryJob({ kind: "new_request", threadId: "t" })];

    // Assert
    expect(answers).toEqual([true, false]);
  });
});
