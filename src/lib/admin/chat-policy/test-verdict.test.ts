import { describe, expect, it } from "vitest";

import { getRunSummary, getTestResult, type PolicyTestCase } from "@/lib/admin/chat-policy/test-verdict";

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
