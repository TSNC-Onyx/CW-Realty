import "server-only";

import { getLoaded, getLoadFailure, getQueryLoad, type LoadResult } from "@/lib/admin/load-result";
import type { TestPart } from "@/lib/admin/chat-policy/test-batches";
import type { PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";
import { createServiceClient } from "@/lib/supabase/service-client";

// Test-run jobs and their batch results (docs/cwr-chat-policy-test-batches-plan.md, Part A).
// Only the server reads or writes them (service role); every read also matches the tenant
// and the person who started the run, so nobody can drive or finish someone else's run.

const STALE_JOB_AGE_MS = 24 * 60 * 60 * 1000;

export type TestJob = {
  run_key: string;
  policy_id: string;
  policy_updated_at: string;
  tests_updated_at: string | null;
  test_ids: string[];
  /** The batch size the run started with: a run that spans a site update with a new size stops. */
  batch_size: number;
  batch_count: number;
};

type NewTestJob = {
  tenantId: string;
  userId: string;
  policyId: string;
  policyUpdatedAt: string;
  testsUpdatedAt: string | null;
  testIds: string[];
  batchSize: number;
  batchCount: number;
};

type JobOwner = { tenantId: string; userId: string; runKey: string };

type DatabaseError = { code?: string; message: string };

type PartRow = { batch_index: number; results: PolicyTestResult[] };

export async function insertTestJob(job: NewTestJob): Promise<LoadResult<string>> {
  const result = await createServiceClient()
    .from("chat_policy_test_jobs")
    .insert({
      tenant_id: job.tenantId,
      created_by: job.userId,
      policy_id: job.policyId,
      policy_updated_at: job.policyUpdatedAt,
      tests_updated_at: job.testsUpdatedAt,
      test_ids: job.testIds,
      batch_size: job.batchSize,
      batch_count: job.batchCount,
    })
    .select("run_key")
    .single<{ run_key: string }>();
  if (result.error) return getLoadFailure("test job", result.error);
  return getLoaded(result.data.run_key);
}

/** Runs left behind (a closed tab, a lost connection) are cleared when the next run starts. */
export async function deleteStaleTestJobs(tenantId: string): Promise<DatabaseError | null> {
  const cutoff = new Date(Date.now() - STALE_JOB_AGE_MS).toISOString();
  const { error } = await createServiceClient().from("chat_policy_test_jobs").delete().eq("tenant_id", tenantId).lt("created_at", cutoff);
  return error;
}

/** null when no job matches this tenant, person and key (finished, cleared, or someone else's). */
export async function fetchTestJob({ tenantId, userId, runKey }: JobOwner): Promise<LoadResult<TestJob | null>> {
  const result = await createServiceClient()
    .from("chat_policy_test_jobs")
    .select("run_key, policy_id, policy_updated_at, tests_updated_at, test_ids, batch_size, batch_count")
    .eq("tenant_id", tenantId)
    .eq("created_by", userId)
    .eq("run_key", runKey)
    .maybeSingle<TestJob>();
  return getQueryLoad({ part: "test job", result, empty: null });
}

/** Insert-only: a batch that already has results is refused by the database (unique violation). */
export async function insertTestPart({ runKey, batchIndex, results }: { runKey: string; batchIndex: number; results: PolicyTestResult[] }): Promise<DatabaseError | null> {
  const { error } = await createServiceClient().from("chat_policy_test_parts").insert({ run_key: runKey, batch_index: batchIndex, results });
  return error;
}

export async function fetchTestParts(runKey: string): Promise<LoadResult<TestPart[]>> {
  const result = await createServiceClient().from("chat_policy_test_parts").select("batch_index, results").eq("run_key", runKey).returns<PartRow[]>();
  if (result.error) return getLoadFailure("test results", result.error);
  return getLoaded((result.data ?? []).map((row) => ({ batchIndex: row.batch_index, results: row.results })));
}

/** Its parts go with it (on delete cascade). */
export async function deleteTestJob(runKey: string): Promise<DatabaseError | null> {
  const { error } = await createServiceClient().from("chat_policy_test_jobs").delete().eq("run_key", runKey);
  return error;
}
