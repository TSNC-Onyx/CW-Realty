import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { recordProblem, type ProblemDatabase } from "@/lib/observability/record-problem";
import type { ProblemEvent } from "@/lib/observability/problem-types";

const EVENT: ProblemEvent = { action: "homework.save_file", stage: "storage", severity: "error", origin: "server_member", shownMessage: "Upload for jo@example.com failed" };

function getDatabase(reply: () => Promise<{ data: unknown; error: { code?: string; message: string } | null }>): ProblemDatabase & { calls: string[] } {
  const calls: string[] = [];
  return { calls, rpc: (fn) => (calls.push(fn), reply()) };
}

describe("recording a problem", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("always writes the server-log line first", async () => {
    // Act
    await recordProblem(null, EVENT);

    // Assert
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"message":"problem"'));
  });

  it("never logs personal data", async () => {
    // Act
    await recordProblem(null, EVENT);

    // Assert
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining("jo@example.com"));
  });

  it("reports the problem as not saved when there is no database", async () => {
    // Act
    const result = await recordProblem(null, EVENT);

    // Assert
    expect(result.stored).toBe(false);
  });

  it("returns the reference the database stored", async () => {
    // Arrange
    const db = getDatabase(async () => ({ data: { reference: "CWR-AAA-BBB", stored: true, suppressed: false }, error: null }));

    // Act
    const result = await recordProblem(db, EVENT);

    // Assert
    expect(result).toEqual({ reference: "CWR-AAA-BBB", stored: true, isSuppressed: false });
  });

  it("never throws when the database refuses, and marks the log unhealthy", async () => {
    // Arrange
    const db = getDatabase(async () => ({ data: null, error: { code: "57014", message: "canceling statement" } }));

    // Act
    const result = await recordProblem(db, EVENT);

    // Assert
    expect({ stored: result.stored, calls: db.calls }).toEqual({ stored: false, calls: ["record_problem", "touch_health_check"] });
  });

  it("answers in time when the database is slow, saying the save is unknown", async () => {
    // Arrange
    const db = getDatabase(() => new Promise(() => undefined));

    // Act
    const result = await recordProblem(db, EVENT, { timeoutMs: 5 });

    // Assert
    expect(result.stored).toBe("unknown");
  });

  it("keeps a caller-chosen id so a retried report is recognised", async () => {
    // Arrange
    const payloads: unknown[] = [];
    const db: ProblemDatabase = { rpc: async (_fn, args) => (payloads.push(args), { data: { reference: null, stored: true, suppressed: false }, error: null }) };

    // Act
    await recordProblem(db, EVENT, { id: "0f8fad5b-d9cb-469f-a165-70867728950e" });

    // Assert
    expect(payloads[0]).toMatchObject({ p: { id: "0f8fad5b-d9cb-469f-a165-70867728950e" } });
  });

  it("hands a problem the database refused to the queue, with its id, to write later", async () => {
    // Arrange
    const db = getDatabase(async () => ({ data: null, error: { code: "PGRST000", message: "down" } }));
    const sent: unknown[] = [];
    const retryQueue = { send: async (job: unknown) => void sent.push(job) };

    // Act
    await recordProblem(db, EVENT, { id: "11111111-1111-4111-8111-111111111111", retryQueue });

    // Assert
    expect(sent).toEqual([expect.objectContaining({ kind: "record_problem", payload: expect.objectContaining({ id: "11111111-1111-4111-8111-111111111111", severity: "error" }) })]);
  });

  it("doesn't use the queue when the database took the problem", async () => {
    // Arrange
    const db = getDatabase(async () => ({ data: { reference: "CWR-AAA-BBB", stored: true, suppressed: false }, error: null }));
    const retryQueue = { send: vi.fn(async () => undefined) };

    // Act
    await recordProblem(db, EVENT, { retryQueue });

    // Assert
    expect(retryQueue.send).not.toHaveBeenCalled();
  });
});

