import { deliverEmail } from "./deliveries.ts";
import { recordDeadLetter } from "./dead-letters.ts";
import { JobDataError, RetryableJobError, TransientJobError, type AlertJob, type JobDependencies } from "./jobs.ts";
import { sendProblemAlerts } from "./problem-alerts.ts";
import { processAlertJob } from "./process-alert-job.ts";
import { getAccountEmail } from "./templates.ts";

// The outbox loop (docs/cwr-email-outbox-plan.md): claim due jobs from cwr.email_jobs, turn
// each into emails with today's rules, send, and tell the database how it went. The database
// decides retries (backoff) and when to give up; a job that gives up is marked failed in the
// delivery log and recorded as a problem, like the old dead-letter queue.

export type EmailJobKind = "new_request" | "reply" | "test" | "retry" | "problem_digest" | "account";

export type EmailJob = {
  id: string;
  tenant_id: string;
  kind: EmailJobKind;
  thread_id: string | null;
  message_id: string | null;
  delivery_id: string | null;
  run_id: string | null;
  action_type: string | null;
  recipient_email: string | null;
  new_email: string | null;
  old_email: string | null;
  attempts: number;
  /** One-time link value (invite and reset only); comes from the private secrets table. */
  token_hash: string | null;
};

type JobOutcome = { status: "done" } | { status: "retry"; error: string } | { status: "not_sent"; error: string };

type FinishedStatus = "done" | "pending" | "failed" | "not_sent";

const CLAIM_LIMIT = 10;
// Stops claiming new jobs well inside the Edge Function's 150-second limit.
const TIME_BUDGET_MS = 100_000;
const MAX_ERROR_LENGTH = 1000;

export class OutboxError extends Error {
  constructor(message: string, readonly context: { operation: string; code: string | null }) {
    super(message);
    this.name = "OutboxError";
  }
}

function getAlertJob(job: EmailJob): AlertJob | null {
  if (job.kind === "new_request" && job.thread_id) return { kind: "new_request", threadId: job.thread_id };
  if (job.kind === "reply" && job.message_id) return { kind: "reply", messageId: job.message_id };
  if (job.kind === "test" && job.run_id) return { kind: "test", tenantId: job.tenant_id, runId: job.run_id };
  if (job.kind === "retry" && job.delivery_id) return { kind: "retry", deliveryId: job.delivery_id };
  return null;
}

// Invite and reset emails need their one-time link; without it (expired, or a crashed send whose
// link was already cleaned up) nothing is sent rather than a dead link.
const LINK_ACTION_TYPES = new Set(["invite", "recovery"]);

async function sendAccountEmail(deps: JobDependencies, job: EmailJob): Promise<JobOutcome> {
  if (LINK_ACTION_TYPES.has(job.action_type ?? "") && !job.token_hash) return { status: "not_sent", error: "The link is no longer available; the person can ask again." };
  const values = { siteUrl: deps.siteUrl, tokenHash: encodeURIComponent(job.token_hash ?? ""), email: job.recipient_email ?? "", newEmail: job.new_email ?? "", oldEmail: job.old_email ?? "" };
  const email = getAccountEmail({ actionType: job.action_type ?? "", recipient: job.recipient_email ?? "", values });
  if (!email) return { status: "not_sent", error: `No template for ${job.action_type}` };
  const isRetryable = await deliverEmail(deps, { tenantId: job.tenant_id, kind: "account", threadId: null, messageId: null, jobRunId: job.id, email });
  return isRetryable ? { status: "retry", error: "The email did not go out yet" } : { status: "done" };
}

async function runAlertJob(deps: JobDependencies, alertJob: AlertJob): Promise<JobOutcome> {
  try {
    await processAlertJob(alertJob, deps);
    return { status: "done" };
  } catch (error) {
    if (error instanceof JobDataError) {
      await deps.recordProblem({ action: "jobs.alert_email", stage: "job", severity: "warning", origin: "job", code: alertJob.kind, detail: error.message });
      return { status: "not_sent", error: error.message };
    }
    const isExpected = error instanceof RetryableJobError || error instanceof TransientJobError;
    return { status: "retry", error: isExpected ? error.message : String(error) };
  }
}

/** Runs one job; never throws (an unexpected error becomes a retry). */
export async function runEmailJob(deps: JobDependencies, job: EmailJob, { isEmailReady }: { isEmailReady: boolean }): Promise<JobOutcome> {
  if (job.kind === "problem_digest") {
    await sendProblemAlerts(deps, { isEmailReady });
    return { status: "done" };
  }
  if (job.kind === "account") return sendAccountEmail(deps, job).catch((error: unknown) => ({ status: "retry" as const, error: String(error) }));
  const alertJob = getAlertJob(job);
  return alertJob ? runAlertJob(deps, alertJob) : { status: "not_sent", error: `Job ${job.kind} is missing its reference` };
}

async function fetchClaimedJobs({ db }: JobDependencies): Promise<EmailJob[]> {
  const { data, error } = await db.rpc("claim_email_jobs", { p_limit: CLAIM_LIMIT });
  if (error) throw new OutboxError("Could not claim email jobs", { operation: "claim_email_jobs", code: error.code ?? null });
  return (data ?? []) as EmailJob[];
}

async function saveOutcome({ db }: JobDependencies, job: EmailJob, outcome: JobOutcome): Promise<FinishedStatus> {
  const error = outcome.status === "done" ? null : outcome.error.slice(0, MAX_ERROR_LENGTH);
  const { data, error: saveError } = await db.rpc("finish_email_job", { p_job_id: job.id, p_outcome: outcome.status, p_error: error });
  if (saveError) throw new OutboxError("Could not save an email job's outcome", { operation: "finish_email_job", code: saveError.code ?? null });
  return data as FinishedStatus;
}

async function markAccountEmailGaveUp({ db }: JobDependencies, job: EmailJob): Promise<string | null> {
  const { error } = await db.from("alert_deliveries").update({ status: "failed", last_error: "Gave up after several tries." }).eq("job_run_id", job.id).in("status", ["pending", "sending", "failed"]);
  return error ? (error.code ?? "update") : null;
}

async function recordGaveUp(deps: JobDependencies, job: EmailJob): Promise<void> {
  const alertJob = getAlertJob(job);
  if (alertJob) return recordDeadLetter(alertJob, deps);
  const markError = job.kind === "account" ? await markAccountEmailGaveUp(deps, job) : null;
  await deps.recordProblem({
    action: "jobs.alert_dead_letter",
    stage: "job",
    severity: "error",
    origin: "job",
    code: markError ? `mark_failed_${markError}` : job.kind,
    tenantId: job.tenant_id,
    detail: markError ? "An email gave up, and marking it failed also failed." : "An email gave up after several tries.",
  });
}

async function finishJob(deps: JobDependencies, job: EmailJob, { isEmailReady }: { isEmailReady: boolean }): Promise<void> {
  const outcome = await runEmailJob(deps, job, { isEmailReady });
  const status = await saveOutcome(deps, job, outcome);
  if (status === "failed") await recordGaveUp(deps, job);
}

/** Sends every due job, a batch at a time, until none are left or the time budget runs out. */
export async function runOutbox(deps: JobDependencies, { isEmailReady, now = Date.now }: { isEmailReady: boolean; now?: () => number }): Promise<number> {
  const startedAt = now();
  let finishedCount = 0;
  while (now() - startedAt < TIME_BUDGET_MS) {
    const jobs = await fetchClaimedJobs(deps);
    if (jobs.length === 0) break;
    for (const job of jobs) await finishJob(deps, job, { isEmailReady });
    finishedCount += jobs.length;
  }
  return finishedCount;
}
