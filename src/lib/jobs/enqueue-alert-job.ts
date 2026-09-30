import "server-only";

import { getEmailSender, isEmailConfigured } from "@/lib/email/send-email";
import { ALERT_QUEUE_BINDING, createJobDatabase, type AlertJob, type JobDependencies } from "@/lib/jobs/alert-jobs";
import { processAlertJob } from "@/lib/jobs/process-alert-job";
import { reportProblem } from "@/lib/observability/report-problem";
import { getCloudflareBinding } from "@/lib/platform/cloudflare-bindings";
import { SITE_URL } from "@/lib/site/navigation";

// Hands an email job to the Cloudflare Queue (retries + dead-letter queue). Where there is
// no queue (local `next start`, CI), the job runs right away. Failures are recorded as
// problems and stay visible in the delivery log (docs/cwr-error-tracking-plan.md).

type AlertQueue = { send: (job: AlertJob) => Promise<unknown> };

/**
 * queued: the queue will send it. sent: it ran right away. failed: it did not go out yet (it
 * will be retried). not_set_up: email sending isn't configured, so nothing can go out.
 */
export type EnqueueOutcome = { status: "queued" | "sent" | "failed" | "not_set_up"; reference: string | null };

function getServerJobDependencies(): JobDependencies {
  const db = createJobDatabase({ url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "" });
  return { db, sendEmail: getEmailSender(), siteUrl: SITE_URL };
}

async function runJobNow(job: AlertJob): Promise<EnqueueOutcome> {
  try {
    await processAlertJob(job, getServerJobDependencies());
    return { status: "sent", reference: null };
  } catch (error) {
    const result = await reportProblem({ action: "jobs.alert_email", stage: "job", severity: "error", origin: "job", code: error instanceof Error ? error.name : "NonError", detail: `Alert job ${job.kind} failed; see the delivery log` });
    return { status: "failed", reference: result.reference };
  }
}

async function sendToQueue(queue: AlertQueue, job: AlertJob): Promise<boolean> {
  try {
    await queue.send(job);
    return true;
  } catch (error) {
    await reportProblem({ action: "jobs.alert_email", stage: "external", severity: "warning", origin: "job", code: error instanceof Error ? error.name : "NonError", detail: "Alert queue unavailable; sending now instead" });
    return false;
  }
}

// Without email settings nothing can go out, queued or not; the delivery log says "not sent".
// Noted at info level, so it is written after the response and never slows a visitor's form.
async function getEmailNotSetUpOutcome(job: AlertJob): Promise<EnqueueOutcome> {
  const result = await reportProblem({ action: "jobs.alert_email", stage: "setup", severity: "info", origin: "job", code: "email_not_configured", detail: `Alert job ${job.kind} can't be emailed: email sending is not set up` });
  return { status: "not_set_up", reference: result.reference };
}

/** Never throws: if the queue can't take the job, it runs right away instead. */
export async function enqueueAlertJob(job: AlertJob): Promise<EnqueueOutcome> {
  if (!isEmailConfigured()) {
    await runJobNow(job);
    return getEmailNotSetUpOutcome(job);
  }
  const queue = getCloudflareBinding<AlertQueue>(ALERT_QUEUE_BINDING);
  if (queue && (await sendToQueue(queue, job))) return { status: "queued", reference: null };
  return runJobNow(job);
}
