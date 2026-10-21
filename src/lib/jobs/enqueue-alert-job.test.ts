import { beforeEach, describe, expect, it, vi } from "vitest";

import { enqueueAlertJob } from "@/lib/jobs/enqueue-alert-job";

const { reportProblem, rpc, processAlertJob, jobCount } = vi.hoisted(() => ({
  reportProblem: vi.fn(async () => ({ reference: "CWR-EML-001", stored: "unknown", isSuppressed: false })),
  rpc: vi.fn(),
  processAlertJob: vi.fn(async () => undefined),
  jobCount: { value: 1 },
}));

// The outbox lookup: from("email_jobs").select(...).eq(...).eq(...) resolves to a count.
function getJobQuery() {
  const query = { eq: () => query, then: (resolve: (result: { count: number; error: null }) => void) => resolve({ count: jobCount.value, error: null }) };
  return { select: () => query };
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/observability/report-problem", () => ({ reportProblem }));
vi.mock("@/lib/email-outbox/site-email-settings", () => ({ isSiteEmailConfigured: () => false, getSiteEmailSender: () => vi.fn() }));
vi.mock("../../../supabase/functions/email-worker/process-alert-job.ts", () => ({ processAlertJob }));
vi.mock("../../../supabase/functions/email-worker/jobs.ts", () => ({ ALERT_QUEUE_BINDING: "ALERT_QUEUE", createJobDatabase: () => ({ rpc, from: getJobQuery }) }));

function setOutboxLive(isLive: boolean) {
  rpc.mockImplementation(async (fn: string) => (fn === "is_email_outbox_live" ? { data: isLive, error: null } : { data: "job-id", error: null }));
}

describe("an alert email before the outbox is live", () => {
  beforeEach(() => setOutboxLive(false));

  it("while email sending isn't set up is noted once and later emails share the same reference", async () => {
    // Arrange
    await enqueueAlertJob({ kind: "new_request", threadId: "a" });

    // Act
    const outcome = await enqueueAlertJob({ kind: "new_request", threadId: "b" });

    // Assert
    expect({ outcome, notes: reportProblem.mock.calls.length }).toEqual({ outcome: { status: "not_set_up", reference: "CWR-EML-001" }, notes: 1 });
  });
});

describe("an alert email once the outbox is live", () => {
  beforeEach(() => {
    rpc.mockReset();
    processAlertJob.mockClear();
    jobCount.value = 1;
    setOutboxLive(true);
  });

  it("leaves new requests to the database trigger", async () => {
    // Act
    const outcome = await enqueueAlertJob({ kind: "new_request", threadId: "a" });

    // Assert
    expect([outcome.status, processAlertJob.mock.calls.length]).toEqual(["queued", 0]);
  });

  it("sends a request the old way if the switch turned on after it was saved (no job yet)", async () => {
    // Arrange
    jobCount.value = 0;

    // Act
    await enqueueAlertJob({ kind: "new_request", threadId: "a" });

    // Assert
    expect(processAlertJob.mock.calls.length).toBe(1);
  });

  it("adds a test alert to the outbox", async () => {
    // Act
    const outcome = await enqueueAlertJob({ kind: "test", tenantId: "t", runId: "r" });

    // Assert
    expect([outcome.status, rpc.mock.calls[1]]).toEqual(["queued", ["enqueue_email_job", { p_kind: "test", p_tenant_id: "t", p_run_id: "r" }]]);
  });

  it("reports a Retry the outbox refused as failed, with a reference", async () => {
    // Arrange
    rpc.mockImplementation(async (fn: string) => (fn === "is_email_outbox_live" ? { data: true, error: null } : { data: null, error: { code: "42501" } }));

    // Act
    const outcome = await enqueueAlertJob({ kind: "retry", deliveryId: "d" });

    // Assert
    expect(outcome).toEqual({ status: "failed", reference: "CWR-EML-001" });
  });
});
