import { describe, expect, it } from "vitest";

import { getTagServerOrigin } from "@/lib/tracking/tag-server";

describe("getTagServerOrigin", () => {
  it.each([
    ["https://data.charliewardrealty.com/", "https://data.charliewardrealty.com"],
    ["http://data.charliewardrealty.com", null],
    ["not a url", null],
    [undefined, null],
  ])("turns %s into %s", (value, expected) => {
    // Arrange / Act
    const origin = getTagServerOrigin(value);

    // Assert
    expect(origin).toBe(expected);
  });
});
