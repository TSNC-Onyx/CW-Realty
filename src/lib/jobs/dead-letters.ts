import type { AlertJob, JobDependencies } from "@/lib/jobs/alert-jobs";

// After the queue's last retry a job lands in the dead-letter queue. Whatever it had not
// sent is marked failed, so the Notifications page shows it with a Retry button (Infra §3).

const GAVE_UP_MESSAGE = "Gave up after several tries. Use Retry on the Notifications page.";
const UNFINISHED_STATUSES = ["pending", "sending", "failed"];

export async function recordDeadLetter(job: AlertJob, { db }: JobDependencies): Promise<void> {
  const update = { status: "failed", last_error: GAVE_UP_MESSAGE };
  const query = db.from("alert_deliveries").update(update).in("status", UNFINISHED_STATUSES);
  if (job.kind === "new_request") await query.eq("thread_id", job.threadId);
  if (job.kind === "reply") await query.eq("message_id", job.messageId);
  if (job.kind === "retry") await query.eq("id", job.deliveryId);
  if (job.kind === "test") await query.eq("job_run_id", job.runId);
  console.error(JSON.stringify({ message: "Alert job gave up", job }));
}

/** Seconds to wait before retry number `attempt` (1-based): 1, 2, 4, 8 … minutes, at most an hour. */
export function getRetryDelaySeconds(attempt: number): number {
  const baseSeconds = 60;
  const maxSeconds = 3600;
  return Math.min(baseSeconds * 2 ** Math.max(0, attempt - 1), maxSeconds);
}
