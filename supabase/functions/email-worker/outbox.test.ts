import { beforeEach, describe, expect, it, vi } from "vitest";

import { JobDataError, RetryableJobError, type JobDependencies } from "./jobs.ts";
import { runEmailJob, runOutbox, type EmailJob } from "./outbox.ts";

const { deliverEmail, processAlertJob, sendProblemAlerts, recordDeadLetter } = vi.hoisted(() => ({
  deliverEmail: vi.fn(),
  processAlertJob: vi.fn(),
  sendProblemAlerts: vi.fn(),
  recordDeadLetter: vi.fn(),
}));

vi.mock("./deliveries.ts", () => ({ deliverEmail }));
vi.mock("./process-alert-job.ts", () => ({ processAlertJob }));
vi.mock("./problem-alerts.ts", () => ({ sendProblemAlerts }));
vi.mock("./dead-letters.ts", () => ({ recordDeadLetter }));

const JOB: EmailJob = {
  id: "job-1",
  tenant_id: "tenant-1",
  kind: "new_request",
  thread_id: "thread-1",
  message_id: null,
  delivery_id: null,
  run_id: null,
  action_type: null,
  recipient_email: null,
  new_email: null,
  old_email: null,
  attempts: 1,
  token_hash: null,
};
const ACCOUNT_JOB: EmailJob = { ...JOB, kind: "account", thread_id: null, action_type: "recovery", recipient_email: "owner@example.com", token_hash: "abc/123" };

function getDeps(rpc = vi.fn()): JobDependencies {
  return { db: { rpc } as unknown as JobDependencies["db"], sendEmail: vi.fn(), siteUrl: "https://www.charliewardrealty.com", recordProblem: vi.fn(async () => undefined) };
}

describe("running one email job", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks a new-request job done once its emails went out", async () => {
    // Arrange
    processAlertJob.mockResolvedValue(undefined);

    // Act
    const outcome = await runEmailJob(getDeps(), JOB, { isEmailReady: true });

    // Assert
    expect([outcome, processAlertJob.mock.calls[0]?.[0]]).toEqual([{ status: "done" }, { kind: "new_request", threadId: "thread-1" }]);
  });

  it("asks for another try when an email failed but could still go out", async () => {
    // Arrange
    processAlertJob.mockRejectedValue(new RetryableJobError({ job: { kind: "new_request", threadId: "thread-1" }, failedCount: 1 }));

    // Act
    const outcome = await runEmailJob(getDeps(), JOB, { isEmailReady: true });

    // Assert
    expect(outcome.status).toBe("retry");
  });

  it("gives up at once, and records why, when the request no longer exists", async () => {
    // Arrange
    processAlertJob.mockRejectedValue(new JobDataError("Request not found", { job: { kind: "new_request", threadId: "thread-1" } }));
    const deps = getDeps();

    // Act
    const outcome = await runEmailJob(deps, JOB, { isEmailReady: true });

    // Assert
    expect([outcome.status, vi.mocked(deps.recordProblem).mock.calls.length]).toEqual(["not_sent", 1]);
  });

  it("sends a reset email with a URL-safe link to the site", async () => {
    // Arrange
    deliverEmail.mockResolvedValue(false);

    // Act
    await runEmailJob(getDeps(), ACCOUNT_JOB, { isEmailReady: true });

    // Assert
    const request = deliverEmail.mock.calls[0]?.[1];
    expect([request.kind, request.jobRunId, request.email.text.includes("https://www.charliewardrealty.com/admin/auth/confirm?token_hash=abc%2F123&type=recovery")]).toEqual(["account", "job-1", true]);
  });

  it("does not send an email type Supabase never asks for", async () => {
    // Act
    const outcome = await runEmailJob(getDeps(), { ...ACCOUNT_JOB, action_type: "not_a_type" }, { isEmailReady: true });

    // Assert
    expect([outcome.status, deliverEmail.mock.calls.length]).toEqual(["not_sent", 0]);
  });

  it("runs the problem digest for a digest job", async () => {
    // Act
    const outcome = await runEmailJob(getDeps(), { ...JOB, kind: "problem_digest", thread_id: null }, { isEmailReady: false });

    // Assert
    expect([outcome.status, sendProblemAlerts.mock.calls[0]?.[1]]).toEqual(["done", { isEmailReady: false }]);
  });
});

describe("the outbox loop", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims, sends and reports each job until none are left", async () => {
    // Arrange
    processAlertJob.mockResolvedValue(undefined);
    const rpc = vi.fn(async (fn: string) => (fn === "claim_email_jobs" ? { data: rpc.mock.calls.filter(([name]) => name === "claim_email_jobs").length === 1 ? [JOB] : [], error: null } : { data: "done", error: null }));

    // Act
    const finished = await runOutbox(getDeps(rpc), { isEmailReady: true });

    // Assert
    expect([finished, rpc.mock.calls.map(([fn]) => fn)]).toEqual([1, ["claim_email_jobs", "finish_email_job", "claim_email_jobs"]]);
  });

  it("marks a job that gave up as failed in the delivery log", async () => {
    // Arrange
    processAlertJob.mockRejectedValue(new RetryableJobError({ job: { kind: "new_request", threadId: "thread-1" }, failedCount: 1 }));
    let claims = 0;
    const rpc = vi.fn(async (fn: string) => (fn === "claim_email_jobs" ? { data: claims++ === 0 ? [JOB] : [], error: null } : { data: "failed", error: null }));

    // Act
    await runOutbox(getDeps(rpc), { isEmailReady: true });

    // Assert
    expect(recordDeadLetter.mock.calls[0]?.[0]).toEqual({ kind: "new_request", threadId: "thread-1" });
  });
});
