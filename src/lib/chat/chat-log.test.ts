import { describe, expect, it, vi } from "vitest";

import { getHistoryRows, type MessageRow } from "@/lib/chat/chat-log";

vi.mock("server-only", () => ({}));

describe("getHistoryRows", () => {
  it("keeps every typed exchange and only the latest topic exchange, in order", () => {
    // Arrange
    const rows: MessageRow[] = [
      { role: "visitor", body: "Buying a home", source: "guided" },
      { role: "assistant", body: "We guide buyers.", source: "guided" },
      { role: "visitor", body: "Do you cover High Point?", source: "typed" },
      { role: "assistant", body: "Yes.", source: "typed" },
      { role: "visitor", body: "What does it cost?", source: "guided" },
      { role: "assistant", body: "Nothing up front.", source: "guided" },
    ];

    // Act
    const kept = getHistoryRows(rows).map((row) => row.body);

    // Assert
    expect(kept).toEqual(["Do you cover High Point?", "Yes.", "What does it cost?", "Nothing up front."]);
  });
});
