import { getProblemDigest, type ProblemDigestGroup } from "@/lib/email/messages";
import type { JobDependencies } from "@/lib/jobs/alert-jobs";
import { deliverEmail } from "@/lib/jobs/deliveries";
import { recordProblem } from "@/lib/observability/record-problem";

// The Worker's scheduled run, every 5 minutes (docs/cwr-error-tracking-plan.md): proves the
// sender is alive, checks that the database's own watchdog is running, then emails one digest
// of new system problems to the people an owner chose (owner decision D4). Each step runs on
// its own, so one failing never skips the others. Free of Next.js imports (runs in worker.ts).

type ClaimedRun = { run_id: string; tenant_id: string; groups: ProblemDigestGroup[] };

type DeliveryStatus = "pending" | "sending" | "sent" | "failed" | "not_sent";

export type ProblemAlertOutcome = "sent" | "failed" | "refused" | "not_sent";

const WATCHDOG_STALE_MS = 45 * 60 * 1000;
const EMAIL_NOT_SET_UP = "Email sending is not set up";

class ProblemAlertStepError extends Error {
  constructor(readonly context: { step: string; code: string | null }) {
    super(`Problem-alert step failed: ${context.step}`);
    this.name = "ProblemAlertStepError";
  }
}

function getCheckedData<Row>({ data, error }: { data: Row | null; error: { code?: string } | null }, step: string): Row | null {
  if (error) throw new ProblemAlertStepError({ step, code: error.code ?? null });
  return data;
}

async function fetchTenantIds({ db }: JobDependencies): Promise<string[]> {
  const rows = getCheckedData(await db.from("tenants").select("id"), "fetchTenantIds");
  return (rows ?? []).map((row: { id: string }) => row.id);
}

async function checkWatchdog({ db }: JobDependencies, tenantId: string): Promise<void> {
  const row = getCheckedData(
    await db.from("health_checks").select("last_run_at").eq("tenant_id", tenantId).eq("name", "scheduled_jobs").maybeSingle<{ last_run_at: string | null }>(),
    "checkWatchdog",
  );
  const lastRunMs = row?.last_run_at ? Date.parse(row.last_run_at) : 0;
  if (Date.now() - lastRunMs < WATCHDOG_STALE_MS) return;
  await recordProblem(db, {
    action: "jobs.watchdog",
    stage: "setup",
    severity: "critical",
    origin: "job",
    code: "scheduled_jobs_stale",
    tenantId,
    detail: "The database's own background checks have not run for over 45 minutes.",
  });
}

async function fetchProblemRecipients({ db }: JobDependencies, tenantId: string): Promise<string[]> {
  const rows = getCheckedData(
    await db.from("notification_recipients").select("email").eq("tenant_id", tenantId).eq("is_active", true).eq("gets_problem_alerts", true),
    "fetchProblemRecipients",
  );
  return (rows ?? []).map((row: { email: string }) => row.email);
}

async function fetchRunStatuses({ db }: JobDependencies, runId: string): Promise<DeliveryStatus[]> {
  const rows = getCheckedData(await db.from("alert_deliveries").select("status").eq("kind", "problem").eq("job_run_id", runId), "fetchRunStatuses");
  return (rows ?? []).map((row: { status: DeliveryStatus }) => row.status);
}

export function getProblemAlertOutcome({ statuses, retryableCount }: { statuses: DeliveryStatus[]; retryableCount: number }): ProblemAlertOutcome {
  if (statuses.includes("not_sent")) return "not_sent";
  if (retryableCount > 0) return "failed";
  return statuses.includes("sent") ? "sent" : "refused";
}

async function sendDigest(deps: JobDependencies, { run, recipients }: { run: ClaimedRun; recipients: string[] }): Promise<ProblemAlertOutcome> {
  let retryableCount = 0;
  for (const recipient of recipients) {
    const email = getProblemDigest({ groups: run.groups, recipient, adminUrl: `${deps.siteUrl}/admin` });
    const request = { tenantId: run.tenant_id, kind: "problem" as const, threadId: null, messageId: null, jobRunId: run.run_id, email };
    if (await deliverEmail(deps, request)) retryableCount += 1;
  }
  return getProblemAlertOutcome({ statuses: await fetchRunStatuses(deps, run.run_id), retryableCount });
}

async function sendDueAlerts(deps: JobDependencies, { tenantId, isEmailReady }: { tenantId: string; isEmailReady: boolean }): Promise<void> {
  if (!isEmailReady) {
    getCheckedData(await deps.db.rpc("touch_health_check", { p_name: "problem_alerts", p_is_ok: false, p_error: EMAIL_NOT_SET_UP, p_tenant_id: tenantId }), "markEmailNotSetUp");
    return;
  }
  // Owner decision D4: no one chosen yet means problems wait on the list, unsent.
  const recipients = await fetchProblemRecipients(deps, tenantId);
  if (recipients.length === 0) return;
  const run = getCheckedData(await deps.db.rpc("claim_problem_alerts", { p_tenant_id: tenantId }), "claimProblemAlerts") as ClaimedRun | null;
  if (!run || run.groups.length === 0) return;
  const outcome = await sendDigest(deps, { run, recipients });
  getCheckedData(await deps.db.rpc("finish_problem_alerts", { p_run_id: run.run_id, p_outcome: outcome }), "finishProblemAlerts");
}

async function runStep(deps: JobDependencies, { tenantId, step, work }: { tenantId: string | null; step: string; work: () => Promise<unknown> }): Promise<void> {
  try {
    await work();
  } catch (error) {
    const code = error instanceof ProblemAlertStepError ? error.context.code : error instanceof Error ? error.name : "NonError";
    await recordProblem(deps.db, { action: "jobs.problem_alerts", stage: "job", severity: "error", origin: "job", code, tenantId, detail: `Step: ${step}` });
  }
}

export async function sendProblemAlerts(deps: JobDependencies, { isEmailReady }: { isEmailReady: boolean }): Promise<void> {
  let tenantIds: string[] = [];
  await runStep(deps, { tenantId: null, step: "fetchTenantIds", work: async () => (tenantIds = await fetchTenantIds(deps)) });
  for (const tenantId of tenantIds) {
    await runStep(deps, { tenantId, step: "heartbeat", work: async () => getCheckedData(await deps.db.rpc("touch_heartbeat", { p_name: "problem_alerts", p_tenant_id: tenantId }), "heartbeat") });
    await runStep(deps, { tenantId, step: "checkWatchdog", work: () => checkWatchdog(deps, tenantId) });
    await runStep(deps, { tenantId, step: "sendDueAlerts", work: () => sendDueAlerts(deps, { tenantId, isEmailReady }) });
  }
}
