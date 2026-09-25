import "server-only";

import { runOnce } from "@/lib/admin/idempotency";
import { enqueueAlertJob } from "@/lib/jobs/enqueue-alert-job";
import { CWR_TENANT_SLUG } from "@/lib/supabase/public-client";
import { createServiceClient } from "@/lib/supabase/service-client";

// Turns a checked public request into an inbox thread (Phase 4, task 15), then queues the
// alert emails. The form's one-time key makes a double submit create one thread.

export type InboxSource = "contact" | "booking" | "chat_handoff";

export type NewRequest = {
  source: InboxSource;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  subject: string;
  body: string;
  idempotencyKey: string;
};

export class IntakeError extends Error {
  constructor(message: string, readonly context: { source: InboxSource; cause?: unknown }) {
    super(message);
    this.name = "IntakeError";
  }
}

async function fetchTenantId(): Promise<string> {
  const { data, error } = await createServiceClient().from("tenants").select("id").eq("slug", CWR_TENANT_SLUG).single<{ id: string }>();
  if (error || !data) throw new IntakeError("CWR tenant not found", { source: "contact", cause: error });
  return data.id;
}

async function insertThread(request: NewRequest): Promise<string> {
  const { data, error } = await createServiceClient().rpc("create_inbox_thread", {
    p_tenant_slug: CWR_TENANT_SLUG,
    p_source: request.source,
    p_contact_name: request.contactName,
    p_contact_email: request.contactEmail ?? "",
    p_contact_phone: request.contactPhone ?? "",
    p_subject: request.subject,
    p_body: request.body,
  });
  if (error || typeof data !== "string") throw new IntakeError("Request not saved", { source: request.source, cause: error });
  return data;
}

/** Saves the request (once per key) and queues its alerts. Throws IntakeError. */
export async function submitNewRequest(request: NewRequest): Promise<string> {
  const { idempotencyKey, ...details } = request;
  const { threadId } = await runOnce({
    tenantId: await fetchTenantId(),
    scope: `inbox.${request.source}`,
    key: idempotencyKey,
    requestBody: JSON.stringify(details),
    run: async () => ({ threadId: await insertThread(request) }),
  });
  await enqueueAlertJob({ kind: "new_request", threadId });
  return threadId;
}
