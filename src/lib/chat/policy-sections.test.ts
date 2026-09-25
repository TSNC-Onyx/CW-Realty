import { describe, expect, it } from "vitest";

import { getMatchingSection, getPolicySections } from "@/lib/chat/policy-sections";

describe("getPolicySections", () => {
  it("lists every Markdown heading as a section", () => {
    // Arrange
    const policy = "# Booking a TouchUp\nCall us.\r\n\n## Office hours ##\nWeekdays.\nNot # a heading";

    // Act
    const sections = getPolicySections(policy);

    // Assert
    expect(sections).toEqual(["Booking a TouchUp", "Office hours"]);
  });

  it("finds no sections in plain text", () => {
    // Arrange
    const policy = "Just a paragraph with no headings.";

    // Act
    const sections = getPolicySections(policy);

    // Assert
    expect(sections).toEqual([]);
  });
});

describe("getMatchingSection", () => {
  it("matches a cited title regardless of case and spacing", () => {
    // Arrange
    const sections = ["Office hours"];

    // Act
    const match = getMatchingSection(sections, "  office   HOURS ");

    // Assert
    expect(match).toBe("Office hours");
  });

  it("returns null for a section the policy does not have", () => {
    // Arrange
    const sections = ["Office hours"];

    // Act
    const match = getMatchingSection(sections, "Mortgage rates");

    // Assert
    expect(match).toBeNull();
  });
});
