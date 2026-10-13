// email-worker: the one function that sends every Charlie Ward Realty email
// (docs/cwr-email-outbox-plan.md). Woken by the database (pg_net) right after a job is added to
// cwr.email_jobs, and every minute by the backup job. It checks the shared secret, answers 202
// at once, and does the work in the background so the wake-up call never times out.

import { getBearerToken, isSameSecret } from "./auth.ts";
import { createJobDatabase, type JobDatabase, type JobDependencies } from "./jobs.ts";
import { OutboxError, runOutbox } from "./outbox.ts";
import { getProblemRecorder } from "./problems.ts";
import { getEmailSender, isEmailConfigured } from "./sender.ts";
import { getWorkerSettings, WorkerSettingsError, type WorkerSettings } from "./settings.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const ACCEPTED = 202;
const UNAUTHORIZED = 401;
const METHOD_NOT_ALLOWED = 405;
const NOT_SET_UP_ERROR = "Email sending is not set up";

function getDatabase(): JobDatabase {
  return createJobDatabase({ url: Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" });
}

async function isAuthorized(db: JobDatabase, request: Request): Promise<boolean> {
  const { data, error } = await db.rpc("get_email_worker_secret");
  if (error) return false;
  return isSameSecret(getBearerToken(request.headers.get("authorization")), (data as string | null) ?? "");
}

async function markSendingHealth({ db, recordProblem }: JobDependencies, { isReady }: { isReady: boolean }): Promise<void> {
  const { error } = await db.rpc("touch_health_check", { p_name: "email_sending", p_is_ok: isReady, p_error: isReady ? null : NOT_SET_UP_ERROR });
  if (error) await recordProblem({ action: "jobs.alert_email", stage: "database", severity: "warning", origin: "job", code: error.code ?? "health_check", detail: "Could not record whether email sending is set up." });
}

async function runInBackground(db: JobDatabase, settings: WorkerSettings): Promise<void> {
  const deps: JobDependencies = { db, sendEmail: getEmailSender(settings.email), siteUrl: settings.siteUrl, recordProblem: getProblemRecorder(db) };
  const isEmailReady = isEmailConfigured(settings.email);
  try {
    await markSendingHealth(deps, { isReady: isEmailReady });
    await runOutbox(deps, { isEmailReady });
  } catch (error) {
    const code = error instanceof OutboxError ? error.context.code : error instanceof Error ? error.name : "NonError";
    await deps.recordProblem({ action: "jobs.alert_email", stage: "job", severity: "error", origin: "job", code, detail: "The email-worker stopped early; the backup job will try again." });
  }
}

async function recordBadSettings(db: JobDatabase, settingsError: WorkerSettingsError): Promise<void> {
  const { error } = await db.rpc("touch_health_check", { p_name: "email_sending", p_is_ok: false, p_error: settingsError.message });
  const detail = error ? `${settingsError.message} (the health check could not be updated)` : settingsError.message;
  await getProblemRecorder(db)({ action: "jobs.alert_email", stage: "setup", severity: "critical", origin: "job", code: settingsError.context.setting, detail });
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: METHOD_NOT_ALLOWED });
  const db = getDatabase();
  if (!(await isAuthorized(db, request))) return new Response(null, { status: UNAUTHORIZED });
  try {
    EdgeRuntime.waitUntil(runInBackground(db, getWorkerSettings((name) => Deno.env.get(name))));
  } catch (error) {
    if (!(error instanceof WorkerSettingsError)) throw error;
    EdgeRuntime.waitUntil(recordBadSettings(db, error));
  }
  return new Response(null, { status: ACCEPTED });
}

Deno.serve(handleRequest);
