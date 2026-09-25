import { getNewRequestAlert, getReplyEmail, getTestAlert, getVisitorCopy, type OfficeContact, type RequestSummary } from "@/lib/email/messages";
import type { OutgoingEmail } from "@/lib/email/mailersend";
import { JobDataError, RetryableJobError, TransientJobError, type AlertJob, type JobDependencies } from "@/lib/jobs/alert-jobs";
import { deliverEmail, redeliverEmail, type DeliveryRequest } from "@/lib/jobs/deliveries";
import { getDisplayPhone, type E164Phone } from "@/lib/site/phone";

// Turns a job into emails and sends them (Admin §5: alerts to chosen recipients; Features §2:
// the visitor is told when to expect a reply). Throws RetryableJobError so the queue retries.

type ThreadRow = {
  id: string;
  tenant_id: string;
  source: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  subject: string;
  inbox_messages: { kind: string; body: string; created_at: string }[];
};

// A visitor gets at most this many confirmation emails per hour, whatever they submit.
const VISITOR_COPIES_PER_HOUR = 2;
const HOUR_MS = 60 * 60 * 1000;

const THREAD_COLUMNS = "id, tenant_id, source, contact_name, contact_email, contact_phone, subject, inbox_messages(kind, body, created_at)";

// Database errors are temporary (the queue retries); a missing row is permanent.
function getCheckedData<Row>({ data, error }: { data: Row | null; error: unknown }, operation: string): Row | null {
  if (error) throw new TransientJobError(`Database read failed: ${operation}`, { operation, cause: error });
  return data;
}

async function fetchThread({ db }: JobDependencies, job: AlertJob, threadId: string): Promise<ThreadRow> {
  const thread = getCheckedData(await db.from("inbox_threads").select(THREAD_COLUMNS).eq("id", threadId).maybeSingle<ThreadRow>(), "fetchThread");
  if (!thread) throw new JobDataError("Request not found", { job });
  return thread;
}

async function fetchOffice({ db }: JobDependencies, tenantId: string): Promise<OfficeContact> {
  const office = getCheckedData(await db.from("site_settings").select("phone, email").eq("tenant_id", tenantId).maybeSingle<{ phone: E164Phone; email: string }>(), "fetchOffice");
  return { phoneDisplay: office ? getDisplayPhone(office.phone) : "our office", email: office?.email ?? "" };
}

async function fetchRecipients({ db }: JobDependencies, { tenantId, source }: { tenantId: string; source: string | null }): Promise<string[]> {
  const query = db.from("notification_recipients").select("email").eq("tenant_id", tenantId).eq("is_active", true);
  const rows = getCheckedData(await (source ? query.contains("alert_sources", [source]) : query), "fetchRecipients");
  return (rows ?? []).map((row: { email: string }) => row.email);
}

async function hasRecentVisitorCopies({ db }: JobDependencies, email: string): Promise<boolean> {
  const since = new Date(Date.now() - HOUR_MS).toISOString();
  const { count, error } = await db.from("alert_deliveries").select("id", { count: "exact", head: true }).eq("kind", "visitor_copy").eq("recipient_email", email.toLowerCase()).gte("created_at", since);
  if (error) throw new TransientJobError("Database read failed: hasRecentVisitorCopies", { operation: "hasRecentVisitorCopies", cause: error });
  return (count ?? 0) >= VISITOR_COPIES_PER_HOUR;
}

function getFirstVisitorMessage(thread: ThreadRow): string {
  const inbound = thread.inbox_messages.filter((message) => message.kind === "inbound").sort((first, second) => first.created_at.localeCompare(second.created_at));
  return inbound[0]?.body ?? "";
}

function getSummary(thread: ThreadRow, siteUrl: string): RequestSummary {
  return {
    threadUrl: `${siteUrl}/admin/inbox/${thread.id}`,
    source: thread.source,
    contactName: thread.contact_name,
    contactEmail: thread.contact_email,
    contactPhone: thread.contact_phone ? getDisplayPhone(thread.contact_phone as E164Phone) : null,
    subject: thread.subject,
    message: getFirstVisitorMessage(thread),
  };
}

async function getVisitorCopyRequest(deps: JobDependencies, { thread, office }: { thread: ThreadRow; office: OfficeContact }): Promise<DeliveryRequest | null> {
  if (!thread.contact_email || !office.email) return null;
  const existing = getCheckedData(await deps.db.from("alert_deliveries").select("id").eq("kind", "visitor_copy").eq("thread_id", thread.id).maybeSingle(), "fetchVisitorCopy");
  if (!existing && (await hasRecentVisitorCopies(deps, thread.contact_email))) return null;
  const email = getVisitorCopy({ name: thread.contact_name, email: thread.contact_email, office });
  return { tenantId: thread.tenant_id, kind: "visitor_copy", threadId: thread.id, messageId: null, jobRunId: null, email };
}

async function getNewRequestDeliveries(deps: JobDependencies, job: AlertJob & { kind: "new_request" }): Promise<DeliveryRequest[]> {
  const thread = await fetchThread(deps, job, job.threadId);
  const [recipients, office] = await Promise.all([fetchRecipients(deps, { tenantId: thread.tenant_id, source: thread.source }), fetchOffice(deps, thread.tenant_id)]);
  const summary = getSummary(thread, deps.siteUrl);
  const alerts: DeliveryRequest[] = recipients.map((recipient) => ({ tenantId: thread.tenant_id, kind: "new_request", threadId: thread.id, messageId: null, jobRunId: null, email: getNewRequestAlert(summary, recipient) }));
  const visitorCopy = await getVisitorCopyRequest(deps, { thread, office });
  return visitorCopy ? [...alerts, visitorCopy] : alerts;
}

async function getReplyDelivery(deps: JobDependencies, job: AlertJob, messageId: string): Promise<DeliveryRequest[]> {
  const message = getCheckedData(await deps.db.from("inbox_messages").select("id, tenant_id, thread_id, body, kind").eq("id", messageId).maybeSingle<{ id: string; tenant_id: string; thread_id: string; body: string; kind: string }>(), "fetchReply");
  if (!message || message.kind !== "reply") throw new JobDataError("Reply not found", { job });
  const thread = await fetchThread(deps, job, message.thread_id);
  if (!thread.contact_email) return [];
  const office = await fetchOffice(deps, thread.tenant_id);
  const email = getReplyEmail({ name: thread.contact_name, email: thread.contact_email, reply: message.body, office });
  return [{ tenantId: thread.tenant_id, kind: "reply", threadId: thread.id, messageId: message.id, jobRunId: null, email }];
}

async function getTestDeliveries(deps: JobDependencies, { tenantId, runId }: { tenantId: string; runId: string }): Promise<DeliveryRequest[]> {
  const recipients = await fetchRecipients(deps, { tenantId, source: null });
  return recipients.map((recipient) => ({ tenantId, kind: "test", threadId: null, messageId: null, jobRunId: runId, email: getTestAlert(recipient) }));
}

async function getJobDeliveries(deps: JobDependencies, job: AlertJob): Promise<DeliveryRequest[]> {
  if (job.kind === "new_request") return getNewRequestDeliveries(deps, job);
  if (job.kind === "reply") return getReplyDelivery(deps, job, job.messageId);
  if (job.kind === "test") return getTestDeliveries(deps, job);
  return [];
}

async function getRetryEmail(deps: JobDependencies, job: AlertJob & { kind: "retry" }): Promise<OutgoingEmail | null> {
  const delivery = getCheckedData(
    await deps.db.from("alert_deliveries").select("kind, thread_id, message_id, recipient_email, tenant_id, status").eq("id", job.deliveryId).maybeSingle<{ kind: string; thread_id: string | null; message_id: string | null; recipient_email: string; tenant_id: string; status: string }>(),
    "fetchDelivery",
  );
  if (!delivery) throw new JobDataError("Delivery not found", { job });
  if (delivery.status !== "failed") return null;
  const candidates =
    delivery.kind === "reply" && delivery.message_id
      ? await getReplyDelivery(deps, job, delivery.message_id)
      : delivery.kind === "test"
        ? [{ email: getTestAlert(delivery.recipient_email) }]
        : await getNewRequestDeliveries(deps, { kind: "new_request", threadId: delivery.thread_id ?? "" });
  return candidates.find((candidate) => candidate.email.to.email.toLowerCase() === delivery.recipient_email.toLowerCase())?.email ?? null;
}

async function runRetry(deps: JobDependencies, job: AlertJob & { kind: "retry" }): Promise<number> {
  const email = await getRetryEmail(deps, job);
  if (!email) return 0;
  return (await redeliverEmail(deps, { deliveryId: job.deliveryId, email })) ? 1 : 0;
}

export async function processAlertJob(job: AlertJob, deps: JobDependencies): Promise<void> {
  const retryableFailures = job.kind === "retry" ? await runRetry(deps, job) : await sendAll(deps, await getJobDeliveries(deps, job));
  if (retryableFailures > 0) throw new RetryableJobError({ job, failedCount: retryableFailures });
}

async function sendAll(deps: JobDependencies, deliveries: DeliveryRequest[]): Promise<number> {
  let retryableFailures = 0;
  for (const delivery of deliveries) {
    if (await deliverEmail(deps, delivery)) retryableFailures += 1;
  }
  return retryableFailures;
}
