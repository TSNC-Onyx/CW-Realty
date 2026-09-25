import { describe, expect, it } from "vitest";

import { getHandoffBody } from "@/lib/chat/handoff-body";

describe("getHandoffBody", () => {
  it("is just the question when there was no chat", () => {
    // Arrange / Act
    const body = getHandoffBody({ question: "  Can I see 100 Main St?  ", turns: [] });

    // Assert
    expect(body).toBe("Can I see 100 Main St?");
  });

  it("adds the chat so far after the question", () => {
    // Arrange / Act
    const body = getHandoffBody({ question: "Can I see it?", turns: [{ role: "visitor", body: "Hi" }, { role: "assistant", body: "Hello" }] });

    // Assert
    expect(body).toBe("Can I see it?\n\nChat with the AI assistant so far:\nVisitor: Hi\nAssistant (AI): Hello");
  });

  it("removes restricted numbers from the question", () => {
    // Arrange / Act
    const body = getHandoffBody({ question: "SSN 123-45-6789", turns: [] });

    // Assert
    expect(body).toBe("SSN [number removed]");
  });

  it("keeps the newest turns of a long chat within the size limit", () => {
    // Arrange
    const turns = Array.from({ length: 40 }, (_unused, index) => ({ role: "visitor" as const, body: `${index}:${"x".repeat(900)}` }));

    // Act
    const body = getHandoffBody({ question: "Q", turns });

    // Assert
    expect({ isShort: body.length < 13_000, hasNewest: body.includes("39:"), hasOldest: body.includes("\nVisitor: 0:") }).toEqual({ isShort: true, hasNewest: true, hasOldest: false });
  });
});
