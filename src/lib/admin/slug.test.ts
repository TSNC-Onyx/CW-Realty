import { describe, expect, it } from "vitest";

import { getSlug, isValidSlug } from "@/lib/admin/slug";

describe("web addresses", () => {
  it.each([
    ["5423 Pine Level Dr Browns Summit NC", "5423-pine-level-dr-browns-summit-nc"],
    ["Charlie Ward Sr.", "charlie-ward-sr"],
    ["José  Núñez", "jose-nunez"],
    ["Smith & Jones", "smith-and-jones"],
    ["  --Hello!!  ", "hello"],
  ])("%s → %s", (text, expected) => {
    // Arrange
    const input = text;

    // Act
    const slug = getSlug(input);

    // Assert
    expect(slug).toBe(expected);
  });

  it("accepts only lowercase words joined by single dashes", () => {
    // Arrange
    const slugs = ["pine-level", "Pine-Level", "pine--level", "-pine", ""];

    // Act
    const results = slugs.map(isValidSlug);

    // Assert
    expect(results).toEqual([true, false, false, false, false]);
  });
});
