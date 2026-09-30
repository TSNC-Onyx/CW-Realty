import type { AlertJob, JobDependencies } from "@/lib/jobs/alert-jobs";
import { recordProblem } from "@/lib/observability/record-problem";

// After the queue's last retry a job lands in the dead-letter queue. Whatever it had not
// sent is marked failed, so the Notifications page shows it with a Retry button (Infra §3),
// and the give-up is recorded as a problem (docs/cwr-error-tracking-plan.md).

const GAVE_UP_MESSAGE = "Gave up after several tries. Use Retry on the Notifications page.";
const UNFINISHED_STATUSES = ["pending", "sending", "failed"];

function getUnfinishedDeliveries({ db }: JobDependencies, job: AlertJob) {
  const query = db.from("alert_deliveries").update({ status: "failed", last_error: GAVE_UP_MESSAGE }).in("status", UNFINISHED_STATUSES);
  if (job.kind === "new_request") return query.eq("thread_id", job.threadId);
  if (job.kind === "reply") return query.eq("message_id", job.messageId);
  if (job.kind === "retry") return query.eq("id", job.deliveryId);
  return query.eq("job_run_id", job.runId);
}

export async function recordDeadLetter(job: AlertJob, deps: JobDependencies): Promise<void> {
  const { error } = await getUnfinishedDeliveries(deps, job);
  await recordProblem(deps.db, {
    action: "jobs.alert_dead_letter",
    stage: "job",
    severity: "error",
    origin: "job",
    code: error ? `mark_failed_${error.code ?? "error"}` : job.kind,
    tenantId: job.kind === "test" ? job.tenantId : null,
    detail: error ? "An alert email gave up, and marking it failed also failed." : "An alert email gave up after several tries.",
  });
}

/** Seconds to wait before retry number `attempt` (1-based): 1, 2, 4, 8 … minutes, at most an hour. */
export function getRetryDelaySeconds(attempt: number): number {
  const baseSeconds = 60;
  const maxSeconds = 3600;
  return Math.min(baseSeconds * 2 ** Math.max(0, attempt - 1), maxSeconds);
}
