// Custom Worker entry (OpenNext "custom worker" pattern): the generated Next.js fetch
// handler, the queue consumers for alert emails (Phase 4 plan, decision 3), and the scheduled
// problem-alert run (docs/cwr-error-tracking-plan.md; no schedule on the Free plan). The queue
// path is used only until the email outbox is live (docs/cwr-email-outbox-plan.md), then removed.

// The file exists only after a build, so the check below must tolerate both states.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as nextHandler } from "./.open-next/worker.js";
import { getSiteEmailSender, isSiteEmailConfigured } from "./src/lib/email-outbox/site-email-settings";
import { getProblemRetryDelaySeconds, isProblemRetryJob, logAbandonedProblem, storeRetriedProblem, type ProblemRetryJob } from "./src/lib/observability/problem-retry";
import { recordProblem } from "./src/lib/observability/record-problem";
import type { ProblemEvent } from "./src/lib/observability/problem-types";
import { SITE_URL } from "./src/lib/site/navigation";
import { getRetryDelaySeconds, recordDeadLetter } from "./supabase/functions/email-worker/dead-letters.ts";
import { ALERT_DEAD_LETTER_QUEUE, JobDataError, createJobDatabase, type AlertJob, type JobDependencies } from "./supabase/functions/email-worker/jobs.ts";
import { sendProblemAlerts } from "./supabase/functions/email-worker/problem-alerts.ts";
import { processAlertJob } from "./supabase/functions/email-worker/process-alert-job.ts";

type WorkerEnv = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };

type QueueMessage = { body: AlertJob | ProblemRetryJob; attempts: number; ack: () => void; retry: (options?: { delaySeconds?: number }) => void };

type QueueBatch = { queue: string; messages: QueueMessage[] };

type ExecutionContext = { waitUntil: (promise: Promise<unknown>) => void };

function getJobDependencies(env: WorkerEnv): JobDependencies {
  const db = createJobDatabase({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  // Job problems use catalog actions ("jobs.*"); the site's recorder checks them against the catalog.
  const recordJobProblem: JobDependencies["recordProblem"] = async (problem) => void (await recordProblem(db, problem as ProblemEvent));
  return { db, sendEmail: getSiteEmailSender(), siteUrl: SITE_URL, recordProblem: recordJobProblem };
}

async function recordDroppedJob(deps: JobDependencies, error: JobDataError): Promise<void> {
  await deps.recordProblem({ action: "jobs.alert_email", stage: "job", severity: "warning", origin: "job", code: error.context.job.kind, detail: error.message });
}

async function handleProblemRetry({ message, job, deps }: { message: QueueMessage; job: ProblemRetryJob; deps: JobDependencies }): Promise<void> {
  try {
    await storeRetriedProblem({ db: deps.db, job });
    message.ack();
  } catch {
    message.retry({ delaySeconds: getProblemRetryDelaySeconds(message.attempts) });
  }
}

async function handleAlert(message: QueueMessage, deps: JobDependencies): Promise<void> {
  const job = message.body;
  if (isProblemRetryJob(job)) return handleProblemRetry({ message, job, deps });
  try {
    await processAlertJob(job, deps);
    message.ack();
  } catch (error) {
    if (error instanceof JobDataError) {
      await recordDroppedJob(deps, error);
      message.ack();
      return;
    }
    message.retry({ delaySeconds: getRetryDelaySeconds(message.attempts) });
  }
}

async function handleDeadLetter(message: QueueMessage, deps: JobDependencies): Promise<void> {
  const job = message.body;
  if (isProblemRetryJob(job)) logAbandonedProblem(job);
  else await recordDeadLetter(job, deps);
  message.ack();
}

const worker = {
  fetch: nextHandler.fetch,
  async queue(batch: QueueBatch, env: WorkerEnv): Promise<void> {
    const deps = getJobDependencies(env);
    const handle = batch.queue === ALERT_DEAD_LETTER_QUEUE ? handleDeadLetter : handleAlert;
    for (const message of batch.messages) await handle(message, deps);
  },
  async scheduled(_controller: unknown, env: WorkerEnv, context: ExecutionContext): Promise<void> {
    context.waitUntil(sendProblemAlerts(getJobDependencies(env), { isEmailReady: isSiteEmailConfigured() }));
  },
};

export default worker;
