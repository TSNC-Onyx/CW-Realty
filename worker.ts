// Custom Worker entry (OpenNext "custom worker" pattern): the generated Next.js fetch
// handler plus the queue consumers for alert emails (Phase 4 plan, decision 3).

// The file exists only after a build, so the check below must tolerate both states.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as nextHandler } from "./.open-next/worker.js";
import { getEmailSender } from "./src/lib/email/send-email";
import { ALERT_DEAD_LETTER_QUEUE, JobDataError, createJobDatabase, type AlertJob, type JobDependencies } from "./src/lib/jobs/alert-jobs";
import { getRetryDelaySeconds, recordDeadLetter } from "./src/lib/jobs/dead-letters";
import { processAlertJob } from "./src/lib/jobs/process-alert-job";
import { SITE_URL } from "./src/lib/site/navigation";

type WorkerEnv = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };

type QueueMessage = { body: AlertJob; attempts: number; ack: () => void; retry: (options?: { delaySeconds?: number }) => void };

type QueueBatch = { queue: string; messages: QueueMessage[] };

function getJobDependencies(env: WorkerEnv): JobDependencies {
  const db = createJobDatabase({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  return { db, sendEmail: getEmailSender(), siteUrl: SITE_URL };
}

async function handleAlert(message: QueueMessage, deps: JobDependencies): Promise<void> {
  try {
    await processAlertJob(message.body, deps);
    message.ack();
  } catch (error) {
    const isHopeless = error instanceof JobDataError;
    console.error(JSON.stringify({ message: isHopeless ? "Alert job dropped" : "Alert job will retry", job: message.body, error: String(error) }));
    if (isHopeless) message.ack();
    else message.retry({ delaySeconds: getRetryDelaySeconds(message.attempts) });
  }
}

async function handleDeadLetter(message: QueueMessage, deps: JobDependencies): Promise<void> {
  await recordDeadLetter(message.body, deps);
  message.ack();
}

const worker = {
  fetch: nextHandler.fetch,
  async queue(batch: QueueBatch, env: WorkerEnv): Promise<void> {
    const deps = getJobDependencies(env);
    const handle = batch.queue === ALERT_DEAD_LETTER_QUEUE ? handleDeadLetter : handleAlert;
    for (const message of batch.messages) await handle(message, deps);
  },
};

export default worker;
