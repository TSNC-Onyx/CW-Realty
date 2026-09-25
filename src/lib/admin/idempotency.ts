import "server-only";

import { createServiceClient } from "@/lib/supabase/service-client";

// Retry-safe "create" actions (Infra §3): the first run's result is stored under the
// form's one-time key, and a repeated submit returns that result instead of creating
// a second record. Keys expire after 24 hours (cwr.purge_expired_idempotency_keys).

type IdempotentRun<Result> = { tenantId: string; scope: string; key: string; requestBody: string; run: () => Promise<Result> };

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

export async function runOnce<Result>({ tenantId, scope, key, requestBody, run }: IdempotentRun<Result>): Promise<Result> {
  const table = createServiceClient().from("idempotency_keys");
  const requestHash = await getRequestHash(requestBody);
  const { data: existing } = await table.select("response, request_hash").eq("tenant_id", tenantId).eq("scope", scope).eq("key", key).maybeSingle();
  if (existing && existing.request_hash !== requestHash) throw new DuplicateSubmitError({ scope });
  if (existing?.response) return existing.response as Result;
  if (existing) throw new DuplicateSubmitError({ scope });
  const { error: claimError } = await table.insert({ tenant_id: tenantId, scope, key, request_hash: requestHash });
  if (claimError) throw new DuplicateSubmitError({ scope });
  const result = await run();
  await table.update({ response: result }).eq("tenant_id", tenantId).eq("scope", scope).eq("key", key);
  return result;
}
