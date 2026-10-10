import { describe, expect, it } from "vitest";

import { getCrashCause, getVisitorCrashCause } from "@/lib/observability/crash-cause";
import { ReportedProblemError } from "@/lib/observability/reported-problem-error";

describe("how a server crash on an admin page is recorded", () => {
  it("notes a problem already recorded elsewhere, pointing to that record", () => {
    // Arrange
    const crash = new ReportedProblemError("We couldn't check your access right now. (Ref CWR-ABC-123)", { reference: "CWR-ABC-123" });

    // Act
    const cause = getCrashCause({ crash, stackFrames: "" });

    // Assert
    expect(cause).toEqual({ stage: "unexpected", severity: "info", code: "already_recorded", detail: "Already recorded as CWR-ABC-123: We couldn't check your access right now. (Ref CWR-ABC-123)" });
  });

  it("notes a browser that left before the page finished", () => {
    // Act
    const cause = getCrashCause({ crash: new Error("The destination stream closed early."), stackFrames: "" });

    // Assert
    expect({ severity: cause.severity, code: cause.code }).toEqual({ severity: "info", code: "client_left" });
  });

  it("records a real crash as an error", () => {
    // Act
    const cause = getCrashCause({ crash: new TypeError("Cannot read properties of undefined"), stackFrames: "at page.tsx:12" });

    // Assert
    expect(cause).toEqual({ stage: "unexpected", severity: "error", code: "TypeError", detail: "Cannot read properties of undefined\nat page.tsx:12" });
  });

  it("records a public page's crash without its message, which could repeat what a visitor typed", () => {
    // Act
    const cause = getVisitorCrashCause({ crash: new TypeError("No listing for jo@example.com"), stackFrames: "at page (worker.js:1:2)" });

    // Assert
    expect(cause).toEqual({ stage: "unexpected", severity: "error", code: "TypeError", detail: "TypeError\nat page (worker.js:1:2)" });
  });
});

