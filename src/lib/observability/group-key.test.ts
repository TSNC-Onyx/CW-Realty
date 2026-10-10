import { describe, expect, it } from "vitest";

import { getGroupKey } from "@/lib/observability/group-key";

describe("grouping crashes by what went wrong", () => {
  it("puts two occurrences of the same bug in one group", () => {
    // Act
    const keys = [
      getGroupKey({ stage: "unexpected", detail: "Cannot read properties of undefined (reading 'id')\nat g (worker.js:1:200)" }),
      getGroupKey({ stage: "unexpected", detail: "Cannot read properties of undefined (reading 'id')\nat h (worker.js:9:34)" }),
    ];

    // Assert
    expect(keys[0]).toBe(keys[1]);
  });

  it("keeps two different bugs of the same kind apart", () => {
    // Act
    const keys = [getGroupKey({ stage: "unexpected", detail: "x.map is not a function" }), getGroupKey({ stage: "unexpected", detail: "Cannot read properties of null" })];

    // Assert
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("ignores ids, numbers, addresses and quoted text that change each time", () => {
    // Act
    const keys = [
      getGroupKey({ stage: "browser", detail: 'Listing 5c32c354-6766-4c72-8304-fb999135880c failed at https://x.com/a?b=1 after 1234 ms for "Ann"' }),
      getGroupKey({ stage: "browser", detail: 'Listing 9f000000-0000-4000-8000-000000000001 failed at https://y.com/c after 87 ms for "Bob"' }),
    ];

    // Assert
    expect(keys[0]).toBe(keys[1]);
  });

  it("leaves other problems with their usual grouping", () => {
    // Act
    const key = getGroupKey({ stage: "validate", detail: "Title is required" });

    // Assert
    expect(key).toBeNull();
  });

  it("leaves a report with only code locations (a visitor's) with the usual grouping", () => {
    // Act
    const key = getGroupKey({ stage: "browser", detail: "at a (https://x.com/_next/static/chunks/1.js:1:2)" });

    // Assert
    expect(key).toBeNull();
  });

  it("never carries personal data", () => {
    // Act
    const key = getGroupKey({ stage: "unexpected", detail: "No account for jo@example.com" });

    // Assert
    expect(key).toBe("No account for [email]");
  });
});
