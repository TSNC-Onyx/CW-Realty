import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { getQuickSuccess } from "@/lib/admin/quick-result";
import type { AdminActionOptions } from "@/lib/admin/run-admin-action";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { ReportedProblemError } from "@/lib/observability/reported-problem-error";

const { reportProblem, requireAdmin } = vi.hoisted(() => ({
  reportProblem: vi.fn(async () => ({ reference: "CWR-AAA-BBB", stored: true, isSuppressed: false })),
  requireAdmin: vi.fn(async () => ({ tenantId: "t", userId: "u", role: "owner" })),
}));

vi.mock("@/lib/observability/report-problem", () => ({ reportProblem }));
vi.mock("@/lib/admin/require-admin", async (importOriginal) => ({ ...(await importOriginal<object>()), requireAdmin }));

const OPTIONS: AdminActionOptions = { action: "homework.move", roles: ["owner"] };

describe("one-click action boundary", () => {
  beforeEach(() => {
    reportProblem.mockClear();
  });

  it("records nothing when the action succeeds", async () => {
    // Act
    await runQuickAction(OPTIONS, async () => getQuickSuccess("Moved"));

    // Assert
    expect(reportProblem).not.toHaveBeenCalled();
  });

  it("records a malformed id from a stale page as a warning", async () => {
    // Act
    await runQuickAction(OPTIONS, async () => getQuickSuccess(z.uuid().parse("not-an-id")));

    // Assert
    expect(reportProblem).toHaveBeenCalledWith(expect.objectContaining({ stage: "validate", severity: "warning", code: "ZodError" }));
  });

  it("shows a problem recorded where it happened without recording it twice", async () => {
    // Act
    const result = await runQuickAction(OPTIONS, async () => {
      throw new ReportedProblemError("We couldn't check your access right now. (Ref CWR-ZZZ-ZZZ)", { reference: "CWR-ZZZ-ZZZ" });
    });

    // Assert
    expect({ message: result.message, calls: reportProblem.mock.calls.length }).toEqual({
      message: "We couldn't check your access right now. (Ref CWR-ZZZ-ZZZ)",
      calls: 0,
    });
  });
});
