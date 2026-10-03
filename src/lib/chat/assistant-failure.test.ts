import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { getAssistantFailure } from "@/lib/chat/assistant-failure";

function getApiError({ status, headers = {} }: { status: number; headers?: Record<string, string> }) {
  return Anthropic.APIError.generate(status, { type: "error", error: { type: "api_error", message: "test" } }, "test", new Headers(headers));
}

describe("how serious a failed assistant reply is", () => {
  it.each([
    ["a spend limit or other bad request (400)", 400, "critical"],
    ["a revoked key (401)", 401, "critical"],
    ["a billing problem (402)", 402, "critical"],
    ["a key without access (403)", 403, "critical"],
    ["a retired model (404)", 404, "critical"],
    ["an internal error (500)", 500, "warning"],
    ["an overloaded API (529)", 529, "warning"],
  ])("treats %s correctly", (_label, status, severity) => {
    // Act
    const failure = getAssistantFailure(getApiError({ status }));

    // Assert
    expect(failure.severity).toBe(severity);
  });

  it("treats a rate limit that says when to retry as a warning", () => {
    // Act
    const failure = getAssistantFailure(getApiError({ status: 429, headers: { "retry-after": "30" } }));

    // Assert
    expect(failure).toMatchObject({ severity: "warning", code: "http_429" });
  });

  it("treats a rate limit with no retry time (a spend cap) as critical", () => {
    // Act
    const failure = getAssistantFailure(getApiError({ status: 429 }));

    // Assert
    expect(failure).toMatchObject({ severity: "critical", code: "http_429_spend_cap" });
  });

  it("treats a timeout as a warning", () => {
    // Act
    const failure = getAssistantFailure(new Anthropic.APIConnectionTimeoutError());

    // Assert
    expect(failure).toMatchObject({ severity: "warning", code: "timeout" });
  });

  it("treats a dropped connection as a warning", () => {
    // Act
    const failure = getAssistantFailure(new Anthropic.APIConnectionError({ message: "offline" }));

    // Assert
    expect(failure).toMatchObject({ severity: "warning", code: "network" });
  });

  it("keeps the request id for support", () => {
    // Act
    const failure = getAssistantFailure(getApiError({ status: 500, headers: { "request-id": "req_123" } }));

    // Assert
    expect(failure.detail).toContain("req_123");
  });
});
