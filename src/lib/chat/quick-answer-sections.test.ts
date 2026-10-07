import { describe, expect, it } from "vitest";

import { getPublicSectionText } from "@/lib/chat/policy-sections";
import { getPolicyWithQuickAnswers } from "@/lib/chat/quick-answer-sections";

// Made-up policy text: the real one never goes in the repo.
const POLICY = ["# Office hours", "Weekdays.", "", "# Quick answer: Buying a home", "Old answer.", "", "# Selling a home", "We help sellers."].join("\r\n");

describe("getPolicyWithQuickAnswers", () => {
  it("replaces an existing answer's text and leaves every other section alone", () => {
    // Arrange / Act
    const body = getPolicyWithQuickAnswers({ policyBody: POLICY, answers: [{ label: "Buying a home", text: "New answer." }] });

    // Assert
    expect({ answer: getPublicSectionText(body, "Quick answer: Buying a home"), selling: getPublicSectionText(body, "Selling a home"), office: getPublicSectionText(body, "Office hours") }).toEqual({ answer: "New answer.", selling: "We help sellers.", office: "Weekdays." });
  });

  it("adds a missing answer at the end, keeping the policy's line endings", () => {
    // Arrange / Act
    const body = getPolicyWithQuickAnswers({ policyBody: POLICY, answers: [{ label: "About our team", text: "Meet us." }] });

    // Assert
    expect({ hasCrLfOnly: !/[^\r]\n/.test(body), answer: getPublicSectionText(body, "Quick answer: About our team"), isAtEnd: body.endsWith("# Quick answer: About our team\r\nMeet us.") }).toEqual({ hasCrLfOnly: true, answer: "Meet us.", isAtEnd: true });
  });

  it("removes an answer that was emptied", () => {
    // Arrange / Act
    const body = getPolicyWithQuickAnswers({ policyBody: POLICY, answers: [{ label: "Buying a home", text: "  " }] });

    // Assert
    expect({ answer: getPublicSectionText(body, "Quick answer: Buying a home"), selling: getPublicSectionText(body, "Selling a home") }).toEqual({ answer: null, selling: "We help sellers." });
  });

  it("changes nothing when given the answers already there", () => {
    // Arrange
    const once = getPolicyWithQuickAnswers({ policyBody: POLICY, answers: [{ label: "Buying a home", text: "Old answer." }] });

    // Act
    const twice = getPolicyWithQuickAnswers({ policyBody: once, answers: [{ label: "Buying a home", text: "Old answer." }] });

    // Assert
    expect(twice).toBe(once);
  });
});

describe("getPolicyWithQuickAnswers: safety of the policy text", () => {
  it("never touches a matching heading inside a private section or a code fence, and adds a public one instead", () => {
    // Arrange
    const policyBody = ["# Notes (private)", "## Quick answer: Buying a home", "Private draft.", "# Example", "```", "# Quick answer: Buying a home", "```"].join("\n");

    // Act
    const body = getPolicyWithQuickAnswers({ policyBody, answers: [{ label: "Buying a home", text: "Public answer." }] });

    // Assert
    expect({ keepsPrivate: body.includes("Private draft."), keepsFence: body.includes("```\n# Quick answer: Buying a home\n```"), answer: getPublicSectionText(body, "Quick answer: Buying a home") }).toEqual({ keepsPrivate: true, keepsFence: true, answer: "Public answer." });
  });

  it("writes a pasted multi-line answer as one line, so it can't add headings", () => {
    // Arrange / Act
    const body = getPolicyWithQuickAnswers({ policyBody: "# Office hours\nWeekdays.", answers: [{ label: "About our team", text: "Line one.\n# Sneaky heading\r\nLine two." }] });

    // Assert
    expect(body).toBe("# Office hours\nWeekdays.\n\n# Quick answer: About our team\nLine one. # Sneaky heading Line two.");
  });
});
