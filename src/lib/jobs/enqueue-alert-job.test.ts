import { describe, expect, it, vi } from "vitest";

import { enqueueAlertJob } from "@/lib/jobs/enqueue-alert-job";

const { reportProblem } = vi.hoisted(() => ({
  reportProblem: vi.fn(async () => ({ reference: "CWR-EML-001", stored: "unknown", isSuppressed: false })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/observability/report-problem", () => ({ reportProblem }));
vi.mock("@/lib/email/send-email", () => ({ isEmailConfigured: () => false, getEmailSender: () => vi.fn() }));
vi.mock("@/lib/jobs/process-alert-job", () => ({ processAlertJob: vi.fn(async () => undefined) }));
vi.mock("@/lib/jobs/alert-jobs", () => ({ ALERT_QUEUE_BINDING: "ALERT_QUEUE", createJobDatabase: vi.fn() }));

describe("an alert email while email sending isn't set up", () => {
  it("is noted once and later emails share the same reference", async () => {
    // Arrange
    await enqueueAlertJob({ kind: "new_request", threadId: "a" });

    // Act
    const outcome = await enqueueAlertJob({ kind: "new_request", threadId: "b" });

    // Assert
    expect({ outcome, notes: reportProblem.mock.calls.length }).toEqual({ outcome: { status: "not_set_up", reference: "CWR-EML-001" }, notes: 1 });
  });
});
