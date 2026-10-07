import { describe, expect, it } from "vitest";

import { getExpectationColumns, getTestExpectation, policyTestSchema } from "@/lib/admin/chat-policy/policy-schema";

const BASE_INPUT = { question: "How much is a consultation?", expectation: "answer", expectedSection: "", mustMention: "" };

describe("policyTestSchema: Should mention", () => {
  it("splits phrases on commas and drops blanks", () => {
    // Arrange / Act
    const parsed = policyTestSchema.parse({ ...BASE_INPUT, mustMention: " $500 , flat fee,, " });

    // Assert
    expect(parsed.mustMention).toEqual(["$500", "flat fee"]);
  });

  it("refuses more than three phrases", () => {
    // Arrange / Act
    const parsed = policyTestSchema.safeParse({ ...BASE_INPUT, mustMention: "a, b, c, d" });

    // Assert
    expect(parsed.error?.issues[0]?.message).toBe("Add up to 3 phrases, separated by commas");
  });
});

describe("expectations", () => {
  it.each([
    ["answer", { expected_outcome: "answer", allows_friendly_reply: false }],
    ["answer_or_friendly", { expected_outcome: "answer", allows_friendly_reply: true }],
    ["handoff", { expected_outcome: "handoff", allows_friendly_reply: false }],
  ] as const)("stores %s and reads it back the same", (expectation, columns) => {
    // Arrange / Act
    const stored = getExpectationColumns(expectation);
    const readBack = getTestExpectation({ expectedOutcome: stored.expected_outcome, allowsFriendlyReply: stored.allows_friendly_reply });

    // Assert
    expect({ stored, readBack }).toEqual({ stored: columns, readBack: expectation });
  });
});
