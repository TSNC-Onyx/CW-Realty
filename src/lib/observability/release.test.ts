import { describe, expect, it } from "vitest";

import { getValidRelease } from "@/lib/observability/release";

describe("the release a browser says its page came from", () => {
  it.each([
    ["a full commit id", "d8bd8e903334abca6945ea32bf01ba1eee6ec682", "d8bd8e903334abca6945ea32bf01ba1eee6ec682"],
    ["a short commit id", "d8bd8e9", "d8bd8e9"],
    ["anything else", "../../etc/passwd", null],
    ["nothing", undefined, null],
  ])("keeps %s only if it looks like a commit", (_label, release, expected) => {
    // Act
    const valid = getValidRelease(release);

    // Assert
    expect(valid).toBe(expected);
  });
});
