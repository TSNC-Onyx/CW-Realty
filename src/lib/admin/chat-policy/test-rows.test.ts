import { describe, expect, it } from "vitest";

import { getPublishBlocker, getTestCounts, getTestRows, isAtTestLimit, MAX_TESTS, type OwnerTest, type PublishBlockerInput } from "@/lib/admin/chat-policy/test-rows";
import { BUILT_IN_TEST_CASES, type PolicyTestCase, type PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";

const OPEN_HOURS: OwnerTest = { id: "t1", question: "When are you open?", expectedOutcome: "answer", expectedSection: "Office hours" };
const PRICE: OwnerTest = { id: "t2", question: "What does it cost?", expectedOutcome: "answer", expectedSection: null };

const NO_COUNTS = { all: 0, failed: 0, untested: 0, stale: 0, passed: 0 };

const READY_INPUT: PublishBlockerInput = { isReadyToPublish: false, isRunning: false, hasDraft: true, didRunLoad: true, isAssistantConfigured: true, hasRun: true, isCurrent: true, hasCurrentChecksVersion: true, counts: NO_COUNTS };

function getResult({ testCase, isPassed }: { testCase: PolicyTestCase; isPassed: boolean }): PolicyTestResult {
  return { ...testCase, outcome: "answer", reply: "Reply.", citedSections: [], isPassed };
}

function getOwnerCase(test: OwnerTest): PolicyTestCase {
  return { question: test.question, expectedOutcome: test.expectedOutcome, expectedSection: test.expectedSection, isBuiltIn: false };
}

function getBuiltInResults(): PolicyTestResult[] {
  return BUILT_IN_TEST_CASES.map((testCase) => getResult({ testCase, isPassed: true }));
}

function getStatusOf(rows: ReturnType<typeof getTestRows>, testId: string): string | undefined {
  return rows.find((row) => row.testId === testId)?.status;
}

describe("getTestRows", () => {
  it("shows each question with its own result", () => {
    // Arrange
    const results = [getResult({ testCase: getOwnerCase(OPEN_HOURS), isPassed: true }), getResult({ testCase: getOwnerCase(PRICE), isPassed: false }), ...getBuiltInResults()];

    // Act
    const rows = getTestRows({ tests: [OPEN_HOURS, PRICE], results, isCurrent: true });

    // Assert
    expect({ openHours: getStatusOf(rows, "t1"), price: getStatusOf(rows, "t2") }).toEqual({ openHours: "passed", price: "failed" });
  });

  it("marks a reworded question as not tested, not as its old pass", () => {
    // Arrange
    const results = [getResult({ testCase: { ...getOwnerCase(OPEN_HOURS), question: "What are your hours?" }, isPassed: true })];

    // Act
    const rows = getTestRows({ tests: [OPEN_HOURS], results, isCurrent: true });

    // Assert
    expect(getStatusOf(rows, "t1")).toBe("untested");
  });

  it("marks a question whose expected section changed as not tested", () => {
    // Arrange
    const results = [getResult({ testCase: { ...getOwnerCase(OPEN_HOURS), expectedSection: "Booking" }, isPassed: true })];

    // Act
    const rows = getTestRows({ tests: [OPEN_HOURS], results, isCurrent: true });

    // Assert
    expect(getStatusOf(rows, "t1")).toBe("untested");
  });

  it("never gives an owner question a built-in check's result, even with the same words", () => {
    // Arrange
    const builtIn = BUILT_IN_TEST_CASES[0] as PolicyTestCase;
    const lookAlike: OwnerTest = { id: "t3", question: builtIn.question, expectedOutcome: builtIn.expectedOutcome, expectedSection: builtIn.expectedSection };

    // Act
    const rows = getTestRows({ tests: [lookAlike], results: [getResult({ testCase: builtIn, isPassed: true })], isCurrent: true });

    // Assert
    expect(getStatusOf(rows, "t3")).toBe("untested");
  });

  it("gives two identical questions one result each, never one result twice", () => {
    // Arrange
    const twin: OwnerTest = { ...OPEN_HOURS, id: "t4" };

    // Act
    const rows = getTestRows({ tests: [OPEN_HOURS, twin], results: [getResult({ testCase: getOwnerCase(OPEN_HOURS), isPassed: true })], isCurrent: true });

    // Assert
    expect([getStatusOf(rows, "t1"), getStatusOf(rows, "t4")].sort()).toEqual(["passed", "untested"]);
  });

  it("hides the result of a question that was removed", () => {
    // Arrange
    const results = [getResult({ testCase: getOwnerCase(PRICE), isPassed: false })];

    // Act
    const rows = getTestRows({ tests: [OPEN_HOURS], results, isCurrent: true });

    // Assert
    expect(rows.some((row) => row.question === PRICE.question)).toBe(false);
  });

  it("marks every tested row out of date when the draft or questions changed", () => {
    // Arrange
    const results = [getResult({ testCase: getOwnerCase(OPEN_HOURS), isPassed: true }), ...getBuiltInResults()];

    // Act
    const rows = getTestRows({ tests: [OPEN_HOURS], results, isCurrent: false });

    // Assert
    expect(new Set(rows.map((row) => row.status))).toEqual(new Set(["stale"]));
  });

  it("lists failed, then not tested, then out of date, then passed, with built-in checks last in each group", () => {
    // Arrange
    const results = [getResult({ testCase: getOwnerCase(PRICE), isPassed: false }), ...getBuiltInResults()];

    // Act
    const rows = getTestRows({ tests: [OPEN_HOURS, PRICE], results, isCurrent: true });

    // Assert
    expect(rows.map((row) => `${row.status}:${row.isBuiltIn ? "built-in" : row.testId}`)).toEqual(["failed:t2", "untested:t1", ...BUILT_IN_TEST_CASES.map(() => "passed:built-in")]);
  });

  it("shows the built-in checks as not tested before any run", () => {
    // Arrange / Act
    const rows = getTestRows({ tests: [], results: [], isCurrent: false });

    // Assert
    expect({ count: rows.length, statuses: new Set(rows.map((row) => row.status)), canRemove: rows.some((row) => row.testId !== null) }).toEqual({ count: BUILT_IN_TEST_CASES.length, statuses: new Set(["untested"]), canRemove: false });
  });
});

describe("getTestCounts", () => {
  it("counts the rows by status", () => {
    // Arrange
    const rows = getTestRows({ tests: [OPEN_HOURS, PRICE], results: [getResult({ testCase: getOwnerCase(PRICE), isPassed: false }), ...getBuiltInResults()], isCurrent: true });

    // Act
    const counts = getTestCounts(rows);

    // Assert
    expect(counts).toEqual({ all: 2 + BUILT_IN_TEST_CASES.length, failed: 1, untested: 1, stale: 0, passed: BUILT_IN_TEST_CASES.length });
  });
});

describe("getPublishBlocker", () => {
  it("says nothing when Publish is unlocked, even with rows not tested", () => {
    // Arrange / Act
    const blocker = getPublishBlocker({ ...READY_INPUT, isReadyToPublish: true, counts: { ...NO_COUNTS, untested: 3 } });

    // Assert
    expect(blocker).toBeNull();
  });

  it("says tests are running while a run is going, even when Publish was ready", () => {
    // Arrange / Act
    const blocker = getPublishBlocker({ ...READY_INPUT, isReadyToPublish: true, isRunning: true });

    // Assert
    expect(blocker).toBe("Tests are running…");
  });

  it("gives a reason when Publish is locked but no row has failed", () => {
    // Arrange / Act
    const blocker = getPublishBlocker(READY_INPUT);

    // Assert
    expect(blocker).toBe("Run the tests again to check the current questions.");
  });

  it.each([
    ["no saved draft", { hasDraft: false, didRunLoad: false }, "Save a draft first."],
    ["the run didn't load", { didRunLoad: false, isAssistantConfigured: false }, "The last test run didn't load. Refresh the page."],
    ["the assistant isn't connected", { isAssistantConfigured: false, hasRun: false }, "The chat assistant isn't connected yet, so the tests can't run."],
    ["no run yet", { hasRun: false, isCurrent: false }, "Run the tests first."],
    ["the run is out of date", { isCurrent: false, counts: { ...NO_COUNTS, failed: 2 } }, "You changed the draft or questions since the last run. Run the tests again."],
  ])("names the first problem: %s", (_name, change, expected) => {
    // Arrange / Act
    const blocker = getPublishBlocker({ ...READY_INPUT, ...change });

    // Assert
    expect(blocker).toBe(expected);
  });

  it("counts failed questions in plain words", () => {
    // Arrange / Act
    const blockers = [1, 2].map((failed) => getPublishBlocker({ ...READY_INPUT, counts: { ...NO_COUNTS, failed } }));

    // Assert
    expect(blockers).toEqual(["1 question failed. Fix the draft or the questions, then run the tests again.", "2 questions failed. Fix the draft or the questions, then run the tests again."]);
  });

  it("counts questions not tested yet in plain words", () => {
    // Arrange / Act
    const blockers = [1, 3].map((untested) => getPublishBlocker({ ...READY_INPUT, counts: { ...NO_COUNTS, untested } }));

    // Assert
    expect(blockers).toEqual(["1 question isn't tested yet. Run the tests again.", "3 questions aren't tested yet. Run the tests again."]);
  });
});

describe("getPublishBlocker and the safety checks version", () => {
  it("explains that the safety checks were updated before naming their untested rows", () => {
    // Arrange / Act
    const blocker = getPublishBlocker({ ...READY_INPUT, hasCurrentChecksVersion: false, counts: { ...NO_COUNTS, untested: 3 } });

    // Assert
    expect(blocker).toBe("The safety checks were updated. Run the tests again.");
  });

  it("names a genuinely failed safety check in a current run as a failure", () => {
    // Arrange / Act
    const blocker = getPublishBlocker({ ...READY_INPUT, hasCurrentChecksVersion: true, counts: { ...NO_COUNTS, failed: 1 } });

    // Assert
    expect(blocker).toBe("1 question failed. Fix the draft or the questions, then run the tests again.");
  });
});

describe("isAtTestLimit", () => {
  it("allows a question up to the limit and refuses one more", () => {
    // Arrange / Act
    const answers = [isAtTestLimit(MAX_TESTS - 1), isAtTestLimit(MAX_TESTS)];

    // Assert
    expect(answers).toEqual([false, true]);
  });
});
