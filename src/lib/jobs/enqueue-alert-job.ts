import "server-only";

import { getEmailSender } from "@/lib/email/send-email";
import { ALERT_QUEUE_BINDING, createJobDatabase, type AlertJob, type JobDependencies } from "@/lib/jobs/alert-jobs";
import { processAlertJob } from "@/lib/jobs/process-alert-job";
import { getCloudflareBinding } from "@/lib/platform/cloudflare-bindings";
import { SITE_URL } from "@/lib/site/navigation";

// Hands an email job to the Cloudflare Queue (retries + dead-letter queue). Where there is
// no queue (local `next start`, CI), the job runs right away; failures are logged and stay
// visible in the delivery log.

type AlertQueue = { send: (job: AlertJob) => Promise<unknown> };

function getServerJobDependencies(): JobDependencies {
  const db = createJobDatabase({ url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "" });
  return { db, sendEmail: getEmailSender(), siteUrl: SITE_URL };
}

async function runJobNow(job: AlertJob): Promise<void> {
  try {
    await processAlertJob(job, getServerJobDependencies());
  } catch (error) {
    console.error(JSON.stringify({ message: "Alert job failed; see the delivery log", job, error: String(error) }));
  }
}

async function sendToQueue(queue: AlertQueue, job: AlertJob): Promise<boolean> {
  try {
    await queue.send(job);
    return true;
  } catch (error) {
    console.error(JSON.stringify({ message: "Alert queue unavailable; sending now instead", job, error: String(error) }));
    return false;
  }
}

/** Never throws: if the queue can't take the job, it runs right away instead. */
export async function enqueueAlertJob(job: AlertJob): Promise<void> {
  const queue = getCloudflareBinding<AlertQueue>(ALERT_QUEUE_BINDING);
  if (queue && (await sendToQueue(queue, job))) return;
  await runJobNow(job);
}
