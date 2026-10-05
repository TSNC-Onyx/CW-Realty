import { describe, expect, it } from "vitest";

import { BATCH_SIZE, getAssembledResults, getBatchCount, getBatchSlots, getDoneCount, getOrderedTestIds, getRunTotal, isSameQuestionSet } from "@/lib/admin/chat-policy/test-batches";
import { BUILT_IN_TEST_CASES, type PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";

const OWNER_IDS = Array.from({ length: 40 }, (_unused, index) => `id-${String(index).padStart(2, "0")}`);

function getResult(question: string): PolicyTestResult {
  return { question, expectedOutcome: "answer", expectedSection: null, isBuiltIn: false, outcome: "answer", reply: "Yes.", citedSections: [], isPassed: true };
}

describe("getOrderedTestIds", () => {
  it("orders by newest change, then by id, so the order never shifts", () => {
    // Arrange
    const tests = [
      { id: "b", updated_at: "2026-10-01T00:00:00Z" },
      { id: "c", updated_at: "2026-10-02T00:00:00Z" },
      { id: "a", updated_at: "2026-10-01T00:00:00Z" },
    ];

    // Act
    const testIds = getOrderedTestIds(tests);

    // Assert
    expect(testIds).toEqual(["c", "a", "b"]);
  });
});

describe("getBatchCount", () => {
  it("splits 40 questions plus the 7 built-in checks into 6 batches of at most 8", () => {
    // Arrange / Act
    const batchCount = getBatchCount(OWNER_IDS);

    // Assert
    expect({ batchCount, total: getRunTotal(OWNER_IDS) }).toEqual({ batchCount: 6, total: 47 });
  });
});

describe("getBatchSlots", () => {
  it("puts the built-in checks first", () => {
    // Arrange / Act
    const slots = getBatchSlots({ testIds: OWNER_IDS, batchIndex: 0 });

    // Assert
    expect(slots.map((slot) => slot.kind)).toEqual([...BUILT_IN_TEST_CASES.map(() => "built_in"), "owner"]);
  });

  it("never gives a batch more than the batch size", () => {
    // Arrange
    const batchCount = getBatchCount(OWNER_IDS);

    // Act
    const sizes = Array.from({ length: batchCount }, (_unused, batchIndex) => getBatchSlots({ testIds: OWNER_IDS, batchIndex }).length);

    // Assert
    expect({ isWithinSize: sizes.every((size) => size <= BATCH_SIZE), total: sizes.reduce((sum, size) => sum + size, 0) }).toEqual({ isWithinSize: true, total: 47 });
  });

  it("covers every owner question exactly once, in order", () => {
    // Arrange
    const batchCount = getBatchCount(OWNER_IDS);

    // Act
    const ownerIds = Array.from({ length: batchCount }, (_unused, batchIndex) => getBatchSlots({ testIds: OWNER_IDS, batchIndex })).flat().flatMap((slot) => (slot.kind === "owner" ? [slot.testId] : []));

    // Assert
    expect(ownerIds).toEqual(OWNER_IDS);
  });
});

describe("getDoneCount", () => {
  it("stops at the run's total on the last batch", () => {
    // Arrange / Act
    const done = getDoneCount({ testIds: OWNER_IDS, batchIndex: 5 });

    // Assert
    expect(done).toBe(47);
  });
});

describe("getAssembledResults", () => {
  it("joins the batches in order, whatever order they were saved in", () => {
    // Arrange
    const parts = [
      { batchIndex: 1, results: [getResult("second")] },
      { batchIndex: 0, results: [getResult("first")] },
    ];

    // Act
    const results = getAssembledResults({ parts, batchCount: 2 });

    // Assert
    expect(results?.map((result) => result.question)).toEqual(["first", "second"]);
  });

  it("refuses a run with a batch missing", () => {
    // Arrange / Act
    const results = getAssembledResults({ parts: [{ batchIndex: 0, results: [] }], batchCount: 2 });

    // Assert
    expect(results).toBeNull();
  });

  it("refuses a run with a batch repeated in place of another", () => {
    // Arrange
    const parts = [
      { batchIndex: 0, results: [] },
      { batchIndex: 0, results: [] },
    ];

    // Act
    const results = getAssembledResults({ parts, batchCount: 2 });

    // Assert
    expect(results).toBeNull();
  });
});

describe("isSameQuestionSet", () => {
  it("accepts the same questions in any order", () => {
    // Arrange / Act
    const isSame = isSameQuestionSet({ runTestIds: ["a", "b"], currentTestIds: ["b", "a"] });

    // Assert
    expect(isSame).toBe(true);
  });

  it("refuses when a question was added", () => {
    // Arrange / Act
    const isSame = isSameQuestionSet({ runTestIds: ["a", "b"], currentTestIds: ["a", "b", "c"] });

    // Assert
    expect(isSame).toBe(false);
  });

  it("refuses when a question was swapped for another", () => {
    // Arrange / Act
    const isSame = isSameQuestionSet({ runTestIds: ["a", "b"], currentTestIds: ["a", "c"] });

    // Assert
    expect(isSame).toBe(false);
  });
});
