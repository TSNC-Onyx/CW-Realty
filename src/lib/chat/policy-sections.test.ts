import { describe, expect, it } from "vitest";

import { getMatchingSection, getPolicySections, getPrivateSections, getPublicPolicy, getPublicSections } from "@/lib/chat/policy-sections";

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

// Private sections (owner decision 2026-10-02): notes the assistant never receives.
const MIXED_POLICY = ["# Office hours", "Weekdays.", "## Margins (private)", "Keep 2%.", "### Deep note", "Secret.", "## Booking", "Use the form.", "# Pricing notes ( Private ) ##", "Internal.", "## Sub price", "Also internal."].join("\n");

describe("getPublicPolicy", () => {
  it("removes a private section up to the next heading of the same or a higher level", () => {
    // Arrange / Act
    const policy = getPublicPolicy(MIXED_POLICY);

    // Assert
    expect(policy).toBe(["# Office hours", "Weekdays.", "## Booking", "Use the form."].join("\n"));
  });

  it("keeps a deeper heading inside a private section private", () => {
    // Arrange / Act
    const policy = getPublicPolicy(MIXED_POLICY);

    // Assert
    expect(policy.includes("Deep note") || policy.includes("Secret.")).toBe(false);
  });

  it("runs a private section at the end of the file to the end", () => {
    // Arrange / Act
    const policy = getPublicPolicy(MIXED_POLICY);

    // Assert
    expect(policy.includes("Sub price") || policy.includes("Also internal.")).toBe(false);
  });

  it("ignores heading-like lines inside fenced code blocks", () => {
    // Arrange
    const policy = ["# Examples", "```", "# Not private (private)", "```", "Shown.", "~~~", "# Also code", "~~~", "Still shown."].join("\n");

    // Act
    const publicPolicy = getPublicPolicy(policy);

    // Assert
    expect(publicPolicy).toBe(policy);
  });

  it("keeps a private section private when an earlier code fence is never closed", () => {
    // Arrange
    const policy = ["# Examples", "```", "an unclosed snippet", "# Margins (private)", "Keep 2 percent."].join("\n");

    // Act
    const publicPolicy = getPublicPolicy(policy);

    // Assert
    expect(publicPolicy.includes("Keep 2 percent.")).toBe(false);
  });

  it("closes a fence only on the character that opened it", () => {
    // Arrange
    const policy = ["# Notes (private)", "```", "~~~", "# Inside code", "```", "Still private.", "# Public", "Shown."].join("\n");

    // Act
    const publicPolicy = getPublicPolicy(policy);

    // Assert
    expect(publicPolicy).toBe(["# Public", "Shown."].join("\n"));
  });

  it("accepts (Private), ( private ) and a trailing #", () => {
    // Arrange
    const policy = ["# A (Private)", "a", "# B ( private )", "b", "# C (private) ##", "c", "# D", "d"].join("\n");

    // Act
    const publicPolicy = getPublicPolicy(policy);

    // Assert
    expect(publicPolicy).toBe(["# D", "d"].join("\n"));
  });

  it("leaves a policy with no private sections unchanged", () => {
    // Arrange
    const policy = "# Office hours\nWeekdays.\n## Booking\nUse the form.";

    // Act
    const publicPolicy = getPublicPolicy(policy);

    // Assert
    expect(publicPolicy).toBe(policy);
  });
});

describe("getPublicSections and getPrivateSections", () => {
  it("lists only the headings the assistant may cite", () => {
    // Arrange / Act
    const sections = getPublicSections(MIXED_POLICY);

    // Assert
    expect(sections).toEqual(["Office hours", "Booking"]);
  });

  it("lists private headings and their sub-headings as private", () => {
    // Arrange / Act
    const sections = getPrivateSections(MIXED_POLICY);

    // Assert
    expect(sections).toEqual(["Margins (private)", "Deep note", "Pricing notes ( Private )", "Sub price"]);
  });

  it("doesn't list a title as private when a public heading has the same title", () => {
    // Arrange / Act
    const sections = getPrivateSections("# Pricing\nPublic.\n# Notes (private)\n## Pricing\nInternal.");

    // Assert
    expect(sections).toEqual(["Notes (private)"]);
  });

  it("finds no public section when every section is private", () => {
    // Arrange / Act
    const sections = getPublicSections("# Notes (private)\nInternal.\n## More\nAlso internal.");

    // Assert
    expect(sections).toEqual([]);
  });

  it("finds no public section in a policy of headings only, all private", () => {
    // Arrange / Act
    const sections = getPublicSections("# One (private)\n# Two (private)");

    // Assert
    expect(sections).toEqual([]);
  });

  it("keeps listing every heading for save validation", () => {
    // Arrange / Act
    const sections = getPolicySections(MIXED_POLICY);

    // Assert
    expect(sections).toHaveLength(6);
  });
});
