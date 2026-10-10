import { describe, expect, it } from "vitest";

import { isFirstInThisCopy } from "@/lib/observability/once-per-copy";

describe("a note recorded once per running copy", () => {
  it("is first only the first time", () => {
    // Act
    const answers = [isFirstInThisCopy("test:a"), isFirstInThisCopy("test:a"), isFirstInThisCopy("test:b")];

    // Assert
    expect(answers).toEqual([true, false, true]);
  });
});
