import { describe, expect, it } from "vitest";

import { getRequestId } from "./request-id";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("getRequestId", () => {
  it("keeps a well-formed incoming request ID so traces join up", () => {
    // Arrange
    const incomingRequestId = "8c1f0a2e-edge-trace-01";

    // Act
    const requestId = getRequestId(incomingRequestId);

    // Assert
    expect(requestId).toBe(incomingRequestId);
  });

  it("creates a new ID when none is sent", () => {
    // Arrange
    const incomingRequestId = null;

    // Act
    const requestId = getRequestId(incomingRequestId);

    // Assert
    expect(requestId).toMatch(UUID_PATTERN);
  });

  it.each([
    ["too short", "abc"],
    ["header injection", "valid-id-123\r\nSet-Cookie: x=1"],
    ["too long", "a".repeat(129)],
  ])("replaces an untrusted ID (%s)", (_label, incomingRequestId) => {
    // Arrange — incoming ID provided by the table row

    // Act
    const requestId = getRequestId(incomingRequestId);

    // Assert
    expect(requestId).toMatch(UUID_PATTERN);
  });
});
