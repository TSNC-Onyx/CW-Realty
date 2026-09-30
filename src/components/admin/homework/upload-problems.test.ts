import { describe, expect, it } from "vitest";

import { getHttpProblem, getMessageWithReference, getTransferProblem, getUploadTimeoutMs } from "@/components/admin/homework/upload-problems";

const TWO_MINUTES_MS = 120_000;
const FIFTY_MEGABYTES = 50 * 1024 * 1024;
const REFERENCE = "CWR-7F3-K2Q";

describe("getUploadTimeoutMs", () => {
  it("allows at least two minutes for a small file", () => {
    // Arrange
    const sizeBytes = 1_000;

    // Act
    const timeoutMs = getUploadTimeoutMs(sizeBytes);

    // Assert
    expect(timeoutMs).toBe(TWO_MINUTES_MS);
  });

  it("allows a large video the time a ~1 Mbit/s link needs", () => {
    // Arrange
    const sizeBytes = FIFTY_MEGABYTES;

    // Act
    const timeoutMs = getUploadTimeoutMs(sizeBytes);

    // Assert
    expect(timeoutMs).toBe(420_000);
  });
});

describe("getHttpProblem", () => {
  it("records a storage refusal as a 4xx system error", () => {
    // Arrange
    const response = { status: 403, responseText: '{"error":"invalid signature"}' };

    // Act
    const problem = getHttpProblem(response);

    // Assert
    expect(problem).toMatchObject({ stage: "network", severity: "error", code: "http_4xx" });
  });

  it("records a storage outage as a 5xx system error", () => {
    // Arrange
    const response = { status: 503, responseText: "" };

    // Act
    const problem = getHttpProblem(response);

    // Assert
    expect(problem.code).toBe("http_5xx");
  });

  it("keeps the status and a short part of the response for the record", () => {
    // Arrange
    const response = { status: 413, responseText: "x".repeat(1_000) };

    // Act
    const problem = getHttpProblem(response);

    // Assert
    expect(problem.detail).toBe(`HTTP 413: ${"x".repeat(300)}`);
  });
});

describe("getTransferProblem", () => {
  it("tells the person a timed-out upload took too long", () => {
    // Arrange
    const failure = { code: "timeout" as const, sizeBytes: FIFTY_MEGABYTES, timeoutMs: 420_000 };

    // Act
    const problem = getTransferProblem(failure);

    // Assert
    expect(problem).toMatchObject({ severity: "warning", code: "timeout", message: "The upload took too long. Check your connection and try again." });
  });

  it("tells the person a stopped upload did not finish", () => {
    // Arrange
    const failure = { code: "aborted" as const, sizeBytes: 1_000, timeoutMs: TWO_MINUTES_MS };

    // Act
    const problem = getTransferProblem(failure);

    // Assert
    expect(problem).toMatchObject({ severity: "warning", code: "aborted", message: "The upload stopped before it finished. Try again." });
  });

  it("points the person to their connection when the network drops", () => {
    // Arrange
    const failure = { code: "network" as const, sizeBytes: 1_000, timeoutMs: TWO_MINUTES_MS };

    // Act
    const problem = getTransferProblem(failure);

    // Assert
    expect(problem.message).toBe("The file didn't upload. Check your connection and try again.");
  });
});

describe("getMessageWithReference", () => {
  it("adds the reference to a warning", () => {
    // Arrange
    const shown = { message: "The upload took too long.", severity: "warning" as const, reference: REFERENCE };

    // Act
    const message = getMessageWithReference(shown);

    // Assert
    expect(message).toBe(`The upload took too long. (Ref ${REFERENCE})`);
  });

  it("leaves a typing-mistake message without a reference", () => {
    // Arrange
    const shown = { message: "This file type isn't accepted here.", severity: "info" as const, reference: REFERENCE };

    // Act
    const message = getMessageWithReference(shown);

    // Assert
    expect(message).toBe("This file type isn't accepted here.");
  });

  it("shows the plain message when no reference came back", () => {
    // Arrange
    const shown = { message: "The file didn't upload.", severity: "error" as const, reference: null };

    // Act
    const message = getMessageWithReference(shown);

    // Assert
    expect(message).toBe("The file didn't upload.");
  });
});
