import { beforeEach, describe, expect, it, vi } from "vitest";

import { getErrorState, getSuccessState } from "@/lib/admin/action-state";
import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { runAdminAction, type AdminActionOptions } from "@/lib/admin/run-admin-action";

const { reportProblem, requireAdmin } = vi.hoisted(() => ({
  reportProblem: vi.fn(async () => ({ reference: "CWR-AAA-BBB", stored: true, isSuppressed: false })),
  requireAdmin: vi.fn(async () => ({ tenantId: "t", userId: "u", role: "owner" })),
}));

vi.mock("@/lib/observability/report-problem", () => ({ reportProblem }));
vi.mock("@/lib/admin/require-admin", async (importOriginal) => ({ ...(await importOriginal<object>()), requireAdmin }));

const OPTIONS: AdminActionOptions = { action: "homework.update_video", roles: ["owner"] };

describe("admin action boundary", () => {
  beforeEach(() => {
    reportProblem.mockClear();
  });

  it("records nothing when the action succeeds", async () => {
    // Act
    await runAdminAction(OPTIONS, async () => getSuccessState("Saved"));

    // Assert
    expect(reportProblem).not.toHaveBeenCalled();
  });

  it("records a typing mistake as info without a reference on screen", async () => {
    // Act
    const state = await runAdminAction(OPTIONS, async () => getErrorState({ message: "Fix the highlighted fields.", fieldErrors: { title: "Required" } }));

    // Assert
    expect({ message: state.message, recorded: reportProblem.mock.calls[0] }).toEqual({
      message: "Fix the highlighted fields.",
      recorded: [expect.objectContaining({ action: "homework.update_video", stage: "validate", severity: "info" })],
    });
  });

  it("records a database refusal as a system fault and shows its reference", async () => {
    // Act
    const state = await runAdminAction(OPTIONS, async () => getErrorState({ message: getDatabaseErrorMessage({ code: "XX000", message: "internal error" }) }));

    // Assert
    expect({ message: state.message, recorded: reportProblem.mock.calls[0] }).toEqual({
      message: expect.stringContaining("(Ref CWR-AAA-BBB)"),
      recorded: [expect.objectContaining({ stage: "database", severity: "error", code: "XX000" })],
    });
  });

  it("records a crash and shows the plain message with its reference", async () => {
    // Act
    const state = await runAdminAction(OPTIONS, async () => {
      throw new TypeError("boom");
    });

    // Assert
    expect({ message: state.message, recorded: reportProblem.mock.calls[0] }).toEqual({
      message: "Something went wrong. Your changes were not saved. Try again in a moment. (Ref CWR-AAA-BBB)",
      recorded: [expect.objectContaining({ stage: "unexpected", severity: "error", code: "TypeError" })],
    });
  });

  it("says when the problem may not have been saved", async () => {
    // Arrange
    reportProblem.mockResolvedValueOnce({ reference: "CWR-AAA-BBB", stored: false, isSuppressed: false });

    // Act
    const state = await runAdminAction(OPTIONS, async () => {
      throw new Error("boom");
    });

    // Assert
    expect(state.message).toContain("may not be saved");
  });
});
