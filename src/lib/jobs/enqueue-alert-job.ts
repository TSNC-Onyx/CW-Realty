import "server-only";

import { getSiteEmailSender, isSiteEmailConfigured } from "@/lib/email-outbox/site-email-settings";
import { recordProblem } from "@/lib/observability/record-problem";
import type { ProblemEvent } from "@/lib/observability/problem-types";
import { reportProblem } from "@/lib/observability/report-problem";
import { getCloudflareBinding } from "@/lib/platform/cloudflare-bindings";
import { SITE_URL } from "@/lib/site/navigation";

import { ALERT_QUEUE_BINDING, createJobDatabase, type AlertJob, type JobDatabase, type JobDependencies } from "../../../supabase/functions/email-worker/jobs.ts";
import { processAlertJob } from "../../../supabase/functions/email-worker/process-alert-job.ts";

// The site's side of sending email (docs/cwr-email-outbox-plan.md). One switch,
// cwr.email_settings.is_outbox_live, picks the path, so cutover and undo are a single change:
// - on: the database outbox sends. New requests and replies are already queued by database
//   triggers in the same transaction that saved them; test alerts and Retry are queued here.
// - off: the old Cloudflare Queue path (retries + dead-letter queue); where there is no queue
//   (local `next start`, CI), the job runs right away. Removed after one clean week on the outbox.
// Failures are recorded as problems and stay visible in the delivery log.

type AlertQueue = { send: (job: AlertJob) => Promise<unknown> };

// Decided from this deployment's own settings, so one record per running copy is enough;
// later outcomes share its reference (docs/false-alarm-cleanup-plan.md #8).
let emailNotSetUpReference: string | null = null;

/**
 * queued: the outbox or queue will send it. sent: it ran right away. failed: it did not go out
 * yet (it will be retried). not_set_up: email sending isn't configured, so nothing can go out.
 */
export type EnqueueOutcome = { status: "queued" | "sent" | "failed" | "not_set_up"; reference: string | null };

function getServiceDatabase(): JobDatabase {
  return createJobDatabase({ url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "" });
}

function getServerJobDependencies(db: JobDatabase): JobDependencies {
  // Job problems use catalog actions ("jobs.*"); the site's recorder checks them against the catalog.
  const recordJobProblem: JobDependencies["recordProblem"] = async (problem) => void (await recordProblem(db, problem as ProblemEvent));
  return { db, sendEmail: getSiteEmailSender(), siteUrl: SITE_URL, recordProblem: recordJobProblem };
}

// A failed read falls back to the old path: if the outbox is in fact live, the delivery log's
// dedupe keys still stop any email going out twice.
async function fetchIsOutboxLive(db: JobDatabase): Promise<boolean> {
  const { data, error } = await db.rpc("is_email_outbox_live");
  return !error && data === true;
}

// The trigger queued it if the outbox was live when the request or reply was saved. If the switch
// was turned on in between, there is no job, and the old path sends it instead.
async function hasQueuedJob(db: JobDatabase, job: AlertJob & { kind: "new_request" | "reply" }): Promise<boolean> {
  const query = db.from("email_jobs").select("id", { count: "exact", head: true });
  const { count, error } = await (job.kind === "new_request" ? query.eq("kind", "new_request").eq("thread_id", job.threadId) : query.eq("kind", "reply").eq("message_id", job.messageId));
  return !error && (count ?? 0) > 0;
}

async function queueInOutbox(db: JobDatabase, job: AlertJob): Promise<EnqueueOutcome> {
  if (job.kind === "new_request" || job.kind === "reply") return (await hasQueuedJob(db, job)) ? { status: "queued", reference: null } : sendThroughOldPath(db, job);
  const args = job.kind === "test" ? { p_kind: "test", p_tenant_id: job.tenantId, p_run_id: job.runId } : { p_kind: "retry", p_delivery_id: job.deliveryId };
  const { error } = await db.rpc("enqueue_email_job", args);
  if (!error) return { status: "queued", reference: null };
  const result = await reportProblem({ action: "jobs.alert_email", stage: "database", severity: "error", origin: "job", code: error.code ?? "enqueue", detail: `Could not add a ${job.kind} job to the email outbox` });
  return { status: "failed", reference: result.reference };
}

async function runJobNow(db: JobDatabase, job: AlertJob): Promise<EnqueueOutcome> {
  try {
    await processAlertJob(job, getServerJobDependencies(db));
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
async function fetchEmailNotSetUpReference(job: AlertJob): Promise<string | null> {
  const result = await reportProblem({ action: "jobs.alert_email", stage: "setup", severity: "info", origin: "job", code: "email_not_configured", detail: `Alert job ${job.kind} can't be emailed: email sending is not set up` });
  return result.reference;
}

async function getEmailNotSetUpOutcome(job: AlertJob): Promise<EnqueueOutcome> {
  emailNotSetUpReference ??= await fetchEmailNotSetUpReference(job);
  return { status: "not_set_up", reference: emailNotSetUpReference };
}

async function sendThroughOldPath(db: JobDatabase, job: AlertJob): Promise<EnqueueOutcome> {
  if (!isSiteEmailConfigured()) {
    await runJobNow(db, job);
    return getEmailNotSetUpOutcome(job);
  }
  const queue = getCloudflareBinding<AlertQueue>(ALERT_QUEUE_BINDING);
  if (queue && (await sendToQueue(queue, job))) return { status: "queued", reference: null };
  return runJobNow(db, job);
}

/** Never throws: if the queue can't take the job, it runs right away instead. */
export async function enqueueAlertJob(job: AlertJob): Promise<EnqueueOutcome> {
  const db = getServiceDatabase();
  if (await fetchIsOutboxLive(db)) return queueInOutbox(db, job);
  return sendThroughOldPath(db, job);
}
