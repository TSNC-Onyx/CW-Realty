import { describe, expect, it, vi } from "vitest";

import { isRunCurrent } from "@/lib/admin/chat-policy/queries";

vi.mock("server-only", () => ({}));

const DRAFT = { draftId: "draft", draftVersion: 2, body: "# A", updatedAt: "2026-09-25T10:00:00.123456+00:00" };
const TESTS_CHANGED_AT = "2026-09-25T09:00:00.654321+00:00";

function getRun(stamps: { policy_updated_at: string | null; tests_updated_at: string | null }) {
  return { is_passed: true, ran_at: "2026-09-25T10:05:00+00:00", results: [], ...stamps };
}

describe("isRunCurrent", () => {
  it("counts a run of this exact save and question list", () => {
    // Arrange / Act
    const isCurrent = isRunCurrent({ run: getRun({ policy_updated_at: DRAFT.updatedAt, tests_updated_at: TESTS_CHANGED_AT }), draft: DRAFT, testsChangedAt: TESTS_CHANGED_AT });

    // Assert
    expect(isCurrent).toBe(true);
  });

  it("ignores a run of an earlier save of the draft", () => {
    // Arrange / Act
    const isCurrent = isRunCurrent({ run: getRun({ policy_updated_at: "2026-09-25T09:59:59.999999+00:00", tests_updated_at: TESTS_CHANGED_AT }), draft: DRAFT, testsChangedAt: TESTS_CHANGED_AT });

    // Assert
    expect(isCurrent).toBe(false);
  });

  it("ignores a run made before a test question changed", () => {
    // Arrange / Act
    const isCurrent = isRunCurrent({ run: getRun({ policy_updated_at: DRAFT.updatedAt, tests_updated_at: TESTS_CHANGED_AT }), draft: DRAFT, testsChangedAt: "2026-09-25T10:10:00.000001+00:00" });

    // Assert
    expect(isCurrent).toBe(false);
  });
});
