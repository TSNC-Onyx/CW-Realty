import "server-only";

import { getActionContext } from "@/lib/observability/action-context";
import { reportProblem } from "@/lib/observability/report-problem";
import { createServiceClient } from "@/lib/supabase/service-client";

// Retry-safe "create" actions (Infra §3): the first run's result is stored under the
// form's one-time key, and a repeated submit returns that result instead of creating
// a second record. Keys expire after 24 hours (cwr.purge_expired_idempotency_keys).

type IdempotentRun<Result> = { tenantId: string; scope: string; key: string; requestBody: string; run: () => Promise<Result> };

const UNIQUE_VIOLATION = "23505";

/** The duplicate-submit guard could not read or write its own records, so nothing was saved. */
export class IdempotencyStoreError extends Error {
  constructor(readonly context: { scope: string; code: string | null }) {
    super("Could not check for a repeated submit");
    this.name = "IdempotencyStoreError";
  }
}

export class DuplicateSubmitError extends Error {
  constructor(readonly context: { scope: string }) {
    super("This form is already being saved. Wait a moment, then refresh the page.");
    this.name = "DuplicateSubmitError";
  }
}

async function getRequestHash(requestBody: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(requestBody));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The record was created; only the "already done" note failed, so a repeated submit of this
// form would be refused instead of returning the first result. Worth knowing, not fatal.
async function reportResultNotStored({ scope, code }: { scope: string; code: string | null }): Promise<void> {
  const action = getActionContext()?.action;
  if (!action) return;
  await reportProblem({ action, stage: "database", severity: "warning", code, detail: `Duplicate-submit guard could not store the result (${scope})` });
}

export async function runOnce<Result>({ tenantId, scope, key, requestBody, run }: IdempotentRun<Result>): Promise<Result> {
  const table = createServiceClient().from("idempotency_keys");
  const requestHash = await getRequestHash(requestBody);
  const { data: existing, error: readError } = await table.select("response, request_hash").eq("tenant_id", tenantId).eq("scope", scope).eq("key", key).maybeSingle();
  if (readError) throw new IdempotencyStoreError({ scope, code: readError.code ?? null });
  if (existing && existing.request_hash !== requestHash) throw new DuplicateSubmitError({ scope });
  if (existing?.response) return existing.response as Result;
  if (existing) throw new DuplicateSubmitError({ scope });
  const { error: claimError } = await table.insert({ tenant_id: tenantId, scope, key, request_hash: requestHash });
  if (claimError?.code === UNIQUE_VIOLATION) throw new DuplicateSubmitError({ scope });
  if (claimError) throw new IdempotencyStoreError({ scope, code: claimError.code ?? null });
  const result = await run();
  const { error: storeError } = await table.update({ response: result }).eq("tenant_id", tenantId).eq("scope", scope).eq("key", key);
  if (storeError) await reportResultNotStored({ scope, code: storeError.code ?? null });
  return result;
}
