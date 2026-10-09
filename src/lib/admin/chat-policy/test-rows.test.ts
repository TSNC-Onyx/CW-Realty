import { describe, expect, it } from "vitest";

import { getAttentionCounts, getHistoryWhenLabel, getPublishBlocker, getRestoreState, getTestCounts, getTestRows, getUncoveredSections, isAtTestLimit, MAX_TESTS, SAFETY_FAILED_REASON, SAVE_FIRST_REASON, type OwnerTest, type PublishBlockerInput } from "@/lib/admin/chat-policy/test-rows";
import { BUILT_IN_TEST_CASES, type PolicyTestCase, type PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";

const NO_CHECKS = { allowsFriendlyReply: false, mustMention: [] };
const OPEN_HOURS: OwnerTest = { id: "t1", question: "When are you open?", expectedOutcome: "answer", expectedSection: "Office hours", ...NO_CHECKS };
const PRICE: OwnerTest = { id: "t2", question: "What does it cost?", expectedOutcome: "answer", expectedSection: null, ...NO_CHECKS };

const NO_COUNTS = { all: 0, failed: 0, untested: 0, stale: 0, passed: 0 };

const READY_INPUT: PublishBlockerInput = { isReadyToPublish: false, isRunning: false, hasUnsavedChanges: false, hasDraft: true, didRunLoad: true, isAssistantConfigured: true, hasRun: true, isCurrent: true, hasCurrentChecksVersion: true, counts: NO_COUNTS, safetyFailedCount: 0 };

function getResult({ testCase, isPassed }: { testCase: PolicyTestCase; isPassed: boolean }): PolicyTestResult {
  return { ...testCase, outcome: "answer", reply: "Reply.", citedSections: [], isPassed };
}

function getOwnerCase(test: OwnerTest): PolicyTestCase {
  return { question: test.question, expectedOutcome: test.expectedOutcome, expectedSection: test.expectedSection, isBuiltIn: false, ...NO_CHECKS };
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
    const lookAlike: OwnerTest = { id: "t3", question: builtIn.question, expectedOutcome: builtIn.expectedOutcome, expectedSection: builtIn.expectedSection, ...NO_CHECKS };

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

  it("counts the owner's failed questions in plain words", () => {
    // Arrange / Act
    const blockers = [1, 2].map((failed) => getPublishBlocker({ ...READY_INPUT, counts: { ...NO_COUNTS, failed } }));

    // Assert
    expect(blockers).toEqual(["1 question needs your attention. Use the fixes beside each one, then run the tests again.", "2 questions need your attention. Use the fixes beside each one, then run the tests again."]);
  });

  it("says the developer was notified when only safety checks failed", () => {
    // Arrange / Act
    const blocker = getPublishBlocker({ ...READY_INPUT, counts: { ...NO_COUNTS, failed: 2 }, safetyFailedCount: 2 });

    // Assert
    expect(blocker).toBe(SAFETY_FAILED_REASON);
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
    const blocker = getPublishBlocker({ ...READY_INPUT, hasCurrentChecksVersion: true, counts: { ...NO_COUNTS, failed: 1 }, safetyFailedCount: 1 });

    // Assert
    expect(blocker).toBe(SAFETY_FAILED_REASON);
  });
});

describe("unsaved changes and Restore (bugs 11–12)", () => {
  it("asks to save first before anything else, even when Publish would be ready", () => {
    // Arrange / Act
    const blocker = getPublishBlocker({ ...READY_INPUT, isReadyToPublish: true, hasUnsavedChanges: true });

    // Assert
    expect(blocker).toBe(SAVE_FIRST_REASON);
  });

  it("hides Restore on the open draft itself", () => {
    // Arrange / Act
    const state = getRestoreState({ hasUnsavedChanges: false, isRunning: false, isWorkingDraft: true });

    // Assert
    expect(state.isShown).toBe(false);
  });

  it("locks Restore while a test run is going", () => {
    // Arrange / Act
    const state = getRestoreState({ hasUnsavedChanges: false, isRunning: true, isWorkingDraft: false });

    // Assert
    expect(state).toEqual({ isShown: true, isDisabled: true });
  });

  it("locks Restore while the editor holds unsaved text", () => {
    // Arrange / Act
    const state = getRestoreState({ hasUnsavedChanges: true, isRunning: false, isWorkingDraft: false });

    // Assert
    expect(state.isDisabled).toBe(true);
  });
});

describe("getHistoryWhenLabel (bug 14)", () => {
  it.each([
    [{ status: "published" as const, isWorkingDraft: false }, "Live now · published Oct 4"],
    [{ status: "archived" as const, isWorkingDraft: false }, "Earlier live version · published Oct 4"],
    [{ status: "draft" as const, isWorkingDraft: true }, "Draft · last saved Oct 5"],
    [{ status: "draft" as const, isWorkingDraft: false }, "Unused draft · last saved Oct 5"],
  ])("labels %o as %s", (row, label) => {
    // Arrange / Act
    const whenLabel = getHistoryWhenLabel({ ...row, savedText: "Oct 5", publishedText: "Oct 4" });

    // Assert
    expect(whenLabel).toBe(label);
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

describe("round 4: optional checks, the summary, and coverage", () => {
  it("treats a result saved before the optional checks existed as matching a question with them off", () => {
    // Arrange
    const oldResult = { question: OPEN_HOURS.question, expectedOutcome: OPEN_HOURS.expectedOutcome, expectedSection: OPEN_HOURS.expectedSection, isBuiltIn: false, outcome: "answer" as const, reply: "Weekdays.", citedSections: ["Office hours"], isPassed: true };

    // Act
    const rows = getTestRows({ tests: [OPEN_HOURS], results: [oldResult], isCurrent: true });

    // Assert
    expect(getStatusOf(rows, "t1")).toBe("passed");
  });

  it("shows a question whose checks changed since the run as not tested yet", () => {
    // Arrange
    const changed: OwnerTest = { ...OPEN_HOURS, mustMention: ["9"] };

    // Act
    const rows = getTestRows({ tests: [changed], results: [getResult({ testCase: getOwnerCase(OPEN_HOURS), isPassed: true })], isCurrent: true });

    // Assert
    expect(getStatusOf(rows, "t1")).toBe("untested");
  });

  it("splits failures into the owner's and the developer's, and counts unstable passes", () => {
    // Arrange
    const builtIn = BUILT_IN_TEST_CASES[0] as PolicyTestCase;
    const results = [getResult({ testCase: getOwnerCase(OPEN_HOURS), isPassed: false }), { ...getResult({ testCase: getOwnerCase(PRICE), isPassed: true }), isUnstable: true }, getResult({ testCase: builtIn, isPassed: false })];

    // Act
    const counts = getAttentionCounts(getTestRows({ tests: [OPEN_HOURS, PRICE], results, isCurrent: true }));

    // Assert
    expect({ needsYou: counts.needsYou, developerNotified: counts.developerNotified, unstable: counts.unstable }).toEqual({ needsYou: 1, developerNotified: 1, unstable: 1 });
  });

  it("lists the sections no question checks yet, ignoring capital letters", () => {
    // Arrange / Act
    const uncovered = getUncoveredSections({ sections: ["Office hours", "Seller add-ons", "Our team"], tests: [{ ...OPEN_HOURS, expectedSection: "office HOURS" }, PRICE] });

    // Assert
    expect(uncovered).toEqual(["Seller add-ons", "Our team"]);
  });
});
