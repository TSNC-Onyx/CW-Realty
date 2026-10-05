import "server-only";

import { MAX_TESTS } from "@/lib/admin/chat-policy/test-rows";
import type { PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";
import { getLoaded, getLoadFailure, getQueryLoad, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";
import type { ChatOutcome } from "@/lib/chat/assistant-reply";

// Chatbot policy reads through the owner's own session (RLS: owners only).

const HISTORY_LIMIT = 50;

export type PolicyStatus = "draft" | "published" | "archived";

export type PolicyVersion = { id: string; version: number; status: PolicyStatus; published_at: string | null; updated_at: string };

export type WorkingPolicy = { draftId: string | null; draftVersion: number | null; body: string; updatedAt: string | null };

export type PolicyTest = { id: string; question: string; expected_outcome: ChatOutcome; expected_section: string | null };

type PolicyBody = { body: string; updated_at: string };

export type PolicyTestRun = { is_passed: boolean; ran_at: string; results: PolicyTestResult[]; policy_updated_at: string | null; tests_updated_at: string | null };

export async function fetchPolicyVersions({ supabase, tenantId }: AdminContext): Promise<LoadResult<PolicyVersion[]>> {
  const result = await supabase.from("chat_policies").select("id, version, status, published_at, updated_at").eq("tenant_id", tenantId).order("version", { ascending: false }).limit(HISTORY_LIMIT).returns<PolicyVersion[]>();
  return getQueryLoad({ part: "policy versions", result, empty: [] });
}

async function fetchPolicyBody({ supabase, tenantId }: AdminContext, policyId: string): Promise<LoadResult<PolicyBody | null>> {
  const result = await supabase.from("chat_policies").select("body, updated_at").eq("tenant_id", tenantId).eq("id", policyId).maybeSingle<PolicyBody>();
  return getQueryLoad({ part: "policy text", result, empty: null });
}

/** What the editor opens: the newest draft if it is the newest version, otherwise a new draft started from the newest text. */
export async function fetchWorkingPolicy(admin: AdminContext, versions: PolicyVersion[]): Promise<LoadResult<WorkingPolicy>> {
  const newest = versions[0];
  if (!newest) return getLoaded({ draftId: null, draftVersion: null, body: "", updatedAt: null });
  const policy = await fetchPolicyBody(admin, newest.id);
  if (!policy.isLoaded) return policy;
  const isDraft = newest.status === "draft";
  return getLoaded({ draftId: isDraft ? newest.id : null, draftVersion: isDraft ? newest.version : null, body: policy.data?.body ?? "", updatedAt: isDraft ? (policy.data?.updated_at ?? null) : null });
}

export async function fetchPolicyTests({ supabase, tenantId }: AdminContext): Promise<LoadResult<PolicyTest[]>> {
  const result = await supabase.from("chat_policy_tests").select("id, question, expected_outcome, expected_section").eq("tenant_id", tenantId).eq("is_active", true).order("created_at").limit(MAX_TESTS).returns<PolicyTest[]>();
  return getQueryLoad({ part: "test questions", result, empty: [] });
}

function getTestRunQuery({ supabase, tenantId }: AdminContext, policyId: string) {
  return supabase.from("chat_policy_test_runs").select("is_passed, ran_at, results, policy_updated_at, tests_updated_at").eq("tenant_id", tenantId).eq("policy_id", policyId);
}

export async function fetchLatestTestRun(admin: AdminContext, policyId: string): Promise<LoadResult<PolicyTestRun | null>> {
  const result = await getTestRunQuery(admin, policyId).order("ran_at", { ascending: false }).limit(1).maybeSingle<PolicyTestRun>();
  return getQueryLoad({ part: "latest test run", result, empty: null });
}

/** The live version's newest passing run: the one that let it publish (a failing run may come after it). */
export async function fetchLatestPassingRun(admin: AdminContext, policyId: string): Promise<LoadResult<PolicyTestRun | null>> {
  const result = await getTestRunQuery(admin, policyId).eq("is_passed", true).order("ran_at", { ascending: false }).limit(1).maybeSingle<PolicyTestRun>();
  return getQueryLoad({ part: "live version's test run", result, empty: null });
}

/** Newest change to any test question, active or not: the stamp a test run must match. */
export async function fetchTestsChangedAt({ supabase, tenantId }: AdminContext): Promise<LoadResult<string | null>> {
  const result = await supabase.from("chat_policy_tests").select("updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(1).maybeSingle<{ updated_at: string }>();
  if (result.error) return getLoadFailure("test question changes", result.error);
  return getLoaded(result.data?.updated_at ?? null);
}

/** The owner's Assistant on/off switch (decision D4); on when no settings row exists yet. */
export async function fetchIsAssistantOn({ supabase, tenantId }: AdminContext): Promise<LoadResult<boolean>> {
  const result = await supabase.from("site_settings").select("is_assistant_on").eq("tenant_id", tenantId).maybeSingle<{ is_assistant_on: boolean }>();
  if (result.error) return getLoadFailure("assistant switch", result.error);
  return getLoaded(result.data?.is_assistant_on ?? true);
}

/** Same rule as cwr.publish_chat_policy: the run checked this exact save and this exact set of questions. */
export function isRunCurrent({ run, draft, testsChangedAt }: { run: PolicyTestRun | null; draft: WorkingPolicy; testsChangedAt: string | null }): boolean {
  if (!run || !draft.updatedAt) return false;
  return run.policy_updated_at === draft.updatedAt && run.tests_updated_at === testsChangedAt;
}

/**
 * A live version's text can never change (the database refuses edits to published bodies), so
 * only edits to the test questions make its run out of date. Publishing moves the version's
 * updated_at, so the run's policy stamp is deliberately not compared.
 */
export function isLiveRunCurrent({ run, testsChangedAt }: { run: PolicyTestRun | null; testsChangedAt: string | null }): boolean {
  if (!run) return false;
  return run.tests_updated_at === testsChangedAt;
}
