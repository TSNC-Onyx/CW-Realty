import { EmailSendError, type OutgoingEmail } from "@/lib/email/mailersend";
import { TransientJobError, type JobDependencies } from "@/lib/jobs/alert-jobs";

// One row per email in cwr.alert_deliveries. Each email is found or created, then claimed
// ('sending') with a conditional update before it goes out, so a retried job, a duplicate
// queue delivery, or a Retry click can never send it twice.

export type DeliveryKind = "new_request" | "visitor_copy" | "reply" | "test";

export type DeliveryRequest = {
  tenantId: string;
  kind: DeliveryKind;
  threadId: string | null;
  messageId: string | null;
  jobRunId: string | null;
  email: OutgoingEmail;
};

type DeliveryRow = { id: string; status: "pending" | "sending" | "sent" | "failed" | "not_sent"; attempts: number };

const MAX_ERROR_LENGTH = 1000;
const DONE_STATUSES = new Set(["sent", "not_sent"]);
// A claim older than this is treated as a crashed attempt and may be taken over.
const STALE_CLAIM_MS = 10 * 60 * 1000;
const ROW_COLUMNS = "id, status, attempts";

function getScopedLookup({ db }: JobDependencies, request: DeliveryRequest) {
  const query = db.from("alert_deliveries").select(ROW_COLUMNS).eq("kind", request.kind).eq("recipient_email", request.email.to.email.toLowerCase());
  if (request.kind === "reply") return query.eq("message_id", request.messageId ?? "");
  if (request.kind === "test") return query.eq("job_run_id", request.jobRunId ?? "");
  return query.eq("thread_id", request.threadId ?? "");
}

async function fetchExistingDelivery(deps: JobDependencies, request: DeliveryRequest): Promise<DeliveryRow | null> {
  const { data, error } = await getScopedLookup(deps, request).maybeSingle<DeliveryRow>();
  if (error) throw new TransientJobError("Could not read the delivery log", { operation: "fetchExistingDelivery", cause: error });
  return data;
}

async function createDelivery({ db }: JobDependencies, request: DeliveryRequest): Promise<DeliveryRow> {
  const row = {
    tenant_id: request.tenantId,
    kind: request.kind,
    thread_id: request.threadId,
    message_id: request.messageId,
    job_run_id: request.jobRunId,
    recipient_email: request.email.to.email.toLowerCase(),
  };
  const { data, error } = await db.from("alert_deliveries").insert(row).select(ROW_COLUMNS).single<DeliveryRow>();
  if (error || !data) throw new TransientJobError("Could not record the delivery", { operation: "createDelivery", cause: error });
  return data;
}

/** Takes the delivery for this attempt, or returns null if another attempt has it or it is done. */
async function claimDelivery({ db }: JobDependencies, deliveryId: string): Promise<DeliveryRow | null> {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data, error } = await db
    .from("alert_deliveries")
    .update({ status: "sending" })
    .eq("id", deliveryId)
    .or(`status.in.(pending,failed),and(status.eq.sending,updated_at.lt.${staleBefore})`)
    .select(ROW_COLUMNS)
    .maybeSingle<DeliveryRow>();
  if (error) throw new TransientJobError("Could not claim the delivery", { operation: "claimDelivery", cause: error });
  return data;
}

async function saveOutcome({ db }: JobDependencies, delivery: DeliveryRow, outcome: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("alert_deliveries").update({ attempts: delivery.attempts + 1, ...outcome }).eq("id", delivery.id);
  if (error) throw new TransientJobError("Could not save the delivery result", { operation: "saveOutcome", cause: error });
}

async function sendClaimed(deps: JobDependencies, delivery: DeliveryRow, email: OutgoingEmail): Promise<boolean> {
  let outcome;
  try {
    outcome = await deps.sendEmail(email);
  } catch (error) {
    await saveOutcome(deps, delivery, { status: "failed", last_error: String(error).slice(0, MAX_ERROR_LENGTH) });
    return error instanceof EmailSendError ? error.context.isRetryable : true;
  }
  const fields = outcome.status === "sent" ? { status: "sent", provider_message_id: outcome.providerMessageId, last_error: null } : { status: "not_sent", last_error: outcome.reason };
  await saveOutcome(deps, delivery, fields);
  return false;
}

/**
 * Sends one email unless it already went out. Returns true when a retry could help —
 * including when another attempt holds the claim, so an attempt that crashed mid-send is
 * picked up once its claim goes stale instead of the job being dropped.
 */
export async function deliverEmail(deps: JobDependencies, request: DeliveryRequest): Promise<boolean> {
  const delivery = (await fetchExistingDelivery(deps, request)) ?? (await createDelivery(deps, request));
  if (DONE_STATUSES.has(delivery.status)) return false;
  const claimed = await claimDelivery(deps, delivery.id);
  return claimed ? sendClaimed(deps, claimed, request.email) : true;
}

/** Re-sends one failed delivery (the admin "Retry" button). */
export async function redeliverEmail(deps: JobDependencies, { deliveryId, email }: { deliveryId: string; email: OutgoingEmail }): Promise<boolean> {
  const claimed = await claimDelivery(deps, deliveryId);
  return claimed ? sendClaimed(deps, claimed, email) : false;
}
