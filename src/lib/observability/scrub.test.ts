import { describe, expect, it } from "vitest";

import { getOwnStackFrames, getPathOnly, getScrubbedText } from "@/lib/observability/scrub";

describe("problem text scrubbing", () => {
  it.each([
    ["an email address", "Mail to jo.smith@example.com failed", "Mail to [email] failed"],
    ["a phone number", "Call (336) 555-0142 back", "Call [number] back"],
    ["a token", "Bearer abc.def-ghi rejected", "[token] rejected"],
    ["a database value echo", "Key (email)=(jo@example.com) already exists", "Key (…)=(…) already exists"],
    ["a six-digit sign-in code", "Code 123456 was wrong", "Code [number] was wrong"],
  ])("removes %s", (_label, text, expected) => {
    // Act
    const scrubbed = getScrubbedText(text, 300);

    // Assert
    expect(scrubbed).toBe(expected);
  });

  it("keeps error codes and our own wording", () => {
    // Arrange
    const text = "StorageError 23505: That is already in use.";

    // Act
    const scrubbed = getScrubbedText(text, 300);

    // Assert
    expect(scrubbed).toBe(text);
  });

  it("caps the length", () => {
    // Act
    const scrubbed = getScrubbedText("a".repeat(500), 300);

    // Assert
    expect(scrubbed).toHaveLength(300);
  });

  it("keeps only our own stack frames without query strings", () => {
    // Arrange
    const stack = "Error: x\n    at run (/_next/static/chunks/app.js?v=12:1:2)\n    at extension (chrome-extension://abc/x.js:1:1)";

    // Act
    const frames = getOwnStackFrames(stack);

    // Assert
    expect(frames).toBe("at run (/_next/static/chunks/app.js:1:2)");
  });

  it("reduces a page address to its path", () => {
    // Act
    const path = getPathOnly("https://cwr.example/admin/homework/12?token=secret#top");

    // Assert
    expect(path).toBe("/admin/homework/12");
  });
});
