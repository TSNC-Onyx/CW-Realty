import { describe, expect, it, vi } from "vitest";

import { isRunCurrent } from "@/lib/admin/chat-policy/queries";

vi.mock("server-only", () => ({}));

const DRAFT = { draftId: "draft", draftVersion: 2, body: "# A", updatedAt: "2026-09-25T10:00:00.000000+00:00" };
const TEST = { id: "test", question: "Q", expected_outcome: "answer" as const, expected_section: null, updated_at: "2026-09-25T09:00:00+00:00" };

function getRun(ranAt: string) {
  return { is_passed: true, ran_at: ranAt, results: [] };
}

describe("isRunCurrent", () => {
  it("counts a run made after the last save and test change", () => {
    // Arrange / Act
    const isCurrent = isRunCurrent({ run: getRun("2026-09-25T10:05:00+00:00"), draft: DRAFT, tests: [TEST] });

    // Assert
    expect(isCurrent).toBe(true);
  });

  it("ignores a run made before the draft was saved again", () => {
    // Arrange / Act
    const isCurrent = isRunCurrent({ run: getRun("2026-09-25T09:30:00+00:00"), draft: DRAFT, tests: [TEST] });

    // Assert
    expect(isCurrent).toBe(false);
  });

  it("ignores a run made before a test question changed", () => {
    // Arrange / Act
    const isCurrent = isRunCurrent({ run: getRun("2026-09-25T10:05:00+00:00"), draft: DRAFT, tests: [{ ...TEST, updated_at: "2026-09-25T10:10:00+00:00" }] });

    // Assert
    expect(isCurrent).toBe(false);
  });
});
