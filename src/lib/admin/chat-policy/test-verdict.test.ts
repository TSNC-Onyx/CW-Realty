import { describe, expect, it } from "vitest";

import { BUILT_IN_TEST_CASES, SAFETY_CHECKS_VERSION, getFailedTestResult, getRunSummary, getTestResult, hasCurrentChecksVersion, hasCurrentSafetyChecks, type PolicyTestCase, type PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";
import { getHandoffReply } from "@/lib/chat/assistant-reply";
import { HANDOFF_TEXT } from "@/lib/chat/handoff-text";

const ANSWER_CASE: PolicyTestCase = { question: "When are you open?", expectedOutcome: "answer", expectedSection: "office hours", isBuiltIn: false };

describe("getTestResult", () => {
  it("passes an answer that cites the expected section", () => {
    // Arrange / Act
    const result = getTestResult(ANSWER_CASE, { outcome: "answer", text: "Weekdays.", citedSections: ["Office hours"] });

    // Assert
    expect(result.isPassed).toBe(true);
  });

  it("fails an answer that cites a different section", () => {
    // Arrange / Act
    const result = getTestResult(ANSWER_CASE, { outcome: "answer", text: "Use the form.", citedSections: ["Booking"] });

    // Assert
    expect(result.isPassed).toBe(false);
  });

  it("fails when the assistant hands off a question it should answer", () => {
    // Arrange / Act
    const result = getTestResult({ ...ANSWER_CASE, expectedSection: null }, { outcome: "handoff", text: "A person will help.", citedSections: [] });

    // Assert
    expect(result.isPassed).toBe(false);
  });
});

describe("getRunSummary", () => {
  it("counts the failed tests", () => {
    // Arrange
    const passed = getTestResult(ANSWER_CASE, { outcome: "answer", text: "Weekdays.", citedSections: ["Office hours"] });
    const failed = { ...passed, isPassed: false };

    // Act
    const summary = getRunSummary([passed, failed, failed]);

    // Assert
    expect(summary).toMatch(/^2 of 3 tests failed/);
  });
});

describe("built-in safety checks (Part 2 A2)", () => {
  const BUILT_IN = BUILT_IN_TEST_CASES[2] as PolicyTestCase;

  it("passes a built-in check that gets the approved wording", () => {
    // Arrange / Act
    const result = getTestResult(BUILT_IN, getHandoffReply(HANDOFF_TEXT.needsPerson));

    // Assert
    expect({ isPassed: result.isPassed, checksVersion: result.checksVersion, isApprovedWording: result.isApprovedWording }).toEqual({ isPassed: true, checksVersion: SAFETY_CHECKS_VERSION, isApprovedWording: true });
  });

  it("fails a built-in check that gets words the AI wrote, even though it handed off", () => {
    // Arrange / Act
    const result = getTestResult(BUILT_IN, getHandoffReply("Lots of young families love the west side!"));

    // Assert
    expect(result.isPassed).toBe(false);
  });

  it("fails a built-in check that gets the approved small-talk line", () => {
    // Arrange / Act
    const result = getTestResult(BUILT_IN, getHandoffReply(HANDOFF_TEXT.conversation));

    // Assert
    expect(result.isPassed).toBe(false);
  });

  it("passes an owner hand-off test with AI-written words, marked so the owner can read it", () => {
    // Arrange
    const ownerCase: PolicyTestCase = { question: "Write me a poem about Greensboro.", expectedOutcome: "handoff", expectedSection: null, isBuiltIn: false };

    // Act
    const result = getTestResult(ownerCase, getHandoffReply("I'll leave the poetry to our team! How can I help today?"));

    // Assert
    expect({ isPassed: result.isPassed, isApprovedWording: result.isApprovedWording, checksVersion: result.checksVersion }).toEqual({ isPassed: true, isApprovedWording: false, checksVersion: undefined });
  });

  it("leaves the wording flag off answers", () => {
    // Arrange / Act
    const result = getTestResult(ANSWER_CASE, { outcome: "answer", text: "Weekdays.", citedSections: ["Office hours"] });

    // Assert
    expect(result.isApprovedWording).toBeUndefined();
  });

  it("marks a built-in check with no reply as failed, not approved, under the current version", () => {
    // Arrange / Act
    const result = getFailedTestResult(BUILT_IN);

    // Assert
    expect({ isPassed: result.isPassed, isApprovedWording: result.isApprovedWording, checksVersion: result.checksVersion }).toEqual({ isPassed: false, isApprovedWording: false, checksVersion: SAFETY_CHECKS_VERSION });
  });

  it("has eight built-in checks, all expecting a hand-off", () => {
    // Arrange / Act
    const outcomes = BUILT_IN_TEST_CASES.map((testCase) => testCase.expectedOutcome);

    // Assert
    expect(outcomes).toEqual(Array.from({ length: 8 }, () => "handoff"));
  });
});

describe("hasCurrentChecksVersion and hasCurrentSafetyChecks (Part 2 A5, A6, D2)", () => {
  function getBuiltInResults(reply: string = HANDOFF_TEXT.needsPerson) {
    return BUILT_IN_TEST_CASES.map((testCase) => getTestResult(testCase, getHandoffReply(reply)));
  }

  it("accepts a full, current, approved set for publishing", () => {
    // Arrange / Act
    const isSafe = hasCurrentSafetyChecks(getBuiltInResults());

    // Assert
    expect(isSafe).toBe(true);
  });

  it("counts a current set with a failed built-in as current but not safe", () => {
    // Arrange
    const results = getBuiltInResults().map((result, index) => (index === 0 ? { ...result, isPassed: false } : result));

    // Act / Assert
    expect({ isCurrent: hasCurrentChecksVersion(results), isSafe: hasCurrentSafetyChecks(results) }).toEqual({ isCurrent: true, isSafe: false });
  });

  it("refuses a set saved under an older version", () => {
    // Arrange
    const results = getBuiltInResults().map((result) => ({ ...result, checksVersion: undefined }));

    // Act / Assert
    expect({ isCurrent: hasCurrentChecksVersion(results), isSafe: hasCurrentSafetyChecks(results) }).toEqual({ isCurrent: false, isSafe: false });
  });

  it("refuses a set missing a built-in check", () => {
    // Arrange
    const results = getBuiltInResults().slice(1);

    // Act / Assert
    expect({ isCurrent: hasCurrentChecksVersion(results), isSafe: hasCurrentSafetyChecks(results) }).toEqual({ isCurrent: false, isSafe: false });
  });

  it("refuses a set with a built-in check counted twice", () => {
    // Arrange
    const results = [...getBuiltInResults(), getBuiltInResults()[0] as PolicyTestResult];

    // Act / Assert
    expect({ isCurrent: hasCurrentChecksVersion(results), isSafe: hasCurrentSafetyChecks(results) }).toEqual({ isCurrent: false, isSafe: false });
  });

  it("refuses a set where a built-in got words the AI wrote", () => {
    // Arrange
    const results = getBuiltInResults().map((result, index) => (index === 3 ? { ...result, reply: "Sure, happy to chat!" } : result));

    // Act
    const isSafe = hasCurrentSafetyChecks(results);

    // Assert
    expect(isSafe).toBe(false);
  });
});
