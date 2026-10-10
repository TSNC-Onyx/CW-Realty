import { describe, expect, it } from "vitest";

import { getPathOnly, getScrubbedDetail, getScrubbedText, getStackFrames } from "@/lib/observability/scrub";

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

  it("keeps stack lines without query strings, leaving out browser extensions", () => {
    // Arrange
    const stack = "Error: x\n    at run (/_next/static/chunks/app.js?v=12:1:2)\n    at extension (chrome-extension://abc/x.js:1:1)";

    // Act
    const frames = getStackFrames(stack);

    // Assert
    expect(frames).toBe("at run (/_next/static/chunks/app.js:1:2)");
  });

  it("reduces a page address to its path", () => {
    // Act
    const path = getPathOnly("https://cwr.example/admin/homework/12?token=secret#top");

    // Assert
    expect(path).toBe("/admin/homework/12");
  });

  it("keeps up to ten stack lines", () => {
    // Arrange
    const stack = ["Error: x", ...Array.from({ length: 14 }, (_unused, index) => `    at f${index} (worker.js:1:${index + 1})`)].join("\n");

    // Act
    const frames = getStackFrames(stack);

    // Assert
    expect(frames.split("\n")).toHaveLength(10);
  });

  it("keeps the server's own frames, which the old filter dropped", () => {
    // Act
    const frames = getStackFrames("TypeError: x\n    at fetchAdminListing (worker.js:148415:27)");

    // Assert
    expect(frames).toBe("at fetchAdminListing (worker.js:148415:27)");
  });

  it("never scrubs a stack line's line and column, but still scrubs the message", () => {
    // Act
    const detail = getScrubbedDetail("Failed for jo@example.com 5551234567\nat a (https://x.com/_next/static/chunks/0f3a.js:1:1048576)", 2000);

    // Assert
    expect(detail).toBe("Failed for [email] [number]\nat a (https://x.com/_next/static/chunks/0f3a.js:1:1048576)");
  });

  it("drops a query string inside a code location, which could carry anything", () => {
    // Act
    const detail = getScrubbedDetail("at a (https://x.com/admin/x.js?email=jo@example.com:1:2)", 2000);

    // Assert
    expect(detail).toBe("at a (https://x.com/admin/x.js:1:2)");
  });
});
