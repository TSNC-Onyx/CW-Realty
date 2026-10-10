import { describe, expect, it } from "vitest";

import { getUncaughtReport } from "@/lib/observability/uncaught-error";

function getError({ name = "Error", message, stack }: { name?: string; message: string; stack: string }): Error {
  const error = new Error(message);
  error.name = name;
  error.stack = stack;
  return error;
}

describe("what a page's error watcher reports", () => {
  it("counts a crash in our own code as an error", () => {
    // Act
    const report = getUncaughtReport({ error: getError({ message: "boom", stack: "Error: boom\n at a (https://x.com/_next/static/chunks/1.js:1:2)" }), source: "" });

    // Assert
    expect({ code: report.code, severity: report.severity }).toEqual({ code: "script_error", severity: "error" });
  });

  it("only notes an error from a browser extension", () => {
    // Act
    const report = getUncaughtReport({ error: getError({ message: "boom", stack: "Error: boom\n at a (chrome-extension://abc/x.js:1:2)" }), source: "chrome-extension://abc/x.js" });

    // Assert
    expect(report.severity).toBe("info");
  });

  it("only notes old code after a site update", () => {
    // Act
    const report = getUncaughtReport({ error: getError({ name: "ChunkLoadError", message: "Loading chunk 9 failed.", stack: "ChunkLoadError\n at a (https://x.com/_next/static/chunks/1.js:1:2)" }), source: "" });

    // Assert
    expect({ code: report.code, severity: report.severity }).toEqual({ code: "chunk_load", severity: "info" });
  });
});
