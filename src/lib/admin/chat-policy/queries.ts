import "server-only";

import type { PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";
import type { AdminContext } from "@/lib/admin/require-admin";
import type { ChatOutcome } from "@/lib/chat/assistant-reply";

// Chatbot policy reads through the owner's own session (RLS: owners only).

const HISTORY_LIMIT = 50;
const MAX_TESTS = 100;

export type PolicyStatus = "draft" | "published" | "archived";

export type PolicyVersion = { id: string; version: number; status: PolicyStatus; published_at: string | null; updated_at: string };

export type WorkingPolicy = { draftId: string | null; draftVersion: number | null; body: string; updatedAt: string | null };

export type PolicyTest = { id: string; question: string; expected_outcome: ChatOutcome; expected_section: string | null; updated_at: string };

export type PolicyTestRun = { is_passed: boolean; ran_at: string; results: PolicyTestResult[] };

export async function fetchPolicyVersions({ supabase, tenantId }: AdminContext): Promise<PolicyVersion[]> {
  const { data } = await supabase.from("chat_policies").select("id, version, status, published_at, updated_at").eq("tenant_id", tenantId).order("version", { ascending: false }).limit(HISTORY_LIMIT).returns<PolicyVersion[]>();
  return data ?? [];
}

async function fetchPolicyBody({ supabase, tenantId }: AdminContext, policyId: string): Promise<{ body: string; updated_at: string } | null> {
  const { data } = await supabase.from("chat_policies").select("body, updated_at").eq("tenant_id", tenantId).eq("id", policyId).maybeSingle<{ body: string; updated_at: string }>();
  return data;
}

/** What the editor opens: the newest draft if it is the newest version, otherwise a new draft started from the newest text. */
export async function fetchWorkingPolicy(admin: AdminContext, versions: PolicyVersion[]): Promise<WorkingPolicy> {
  const newest = versions[0];
  if (!newest) return { draftId: null, draftVersion: null, body: "", updatedAt: null };
  const policy = await fetchPolicyBody(admin, newest.id);
  const isDraft = newest.status === "draft";
  return { draftId: isDraft ? newest.id : null, draftVersion: isDraft ? newest.version : null, body: policy?.body ?? "", updatedAt: isDraft ? (policy?.updated_at ?? null) : null };
}

export async function fetchPolicyTests({ supabase, tenantId }: AdminContext): Promise<PolicyTest[]> {
  const { data } = await supabase.from("chat_policy_tests").select("id, question, expected_outcome, expected_section, updated_at").eq("tenant_id", tenantId).eq("is_active", true).order("created_at").limit(MAX_TESTS).returns<PolicyTest[]>();
  return data ?? [];
}

export async function fetchLatestTestRun({ supabase, tenantId }: AdminContext, policyId: string): Promise<PolicyTestRun | null> {
  const { data } = await supabase.from("chat_policy_test_runs").select("is_passed, ran_at, results").eq("tenant_id", tenantId).eq("policy_id", policyId).order("ran_at", { ascending: false }).limit(1).maybeSingle<PolicyTestRun>();
  return data;
}

/** A passing run counts only if it is newer than the draft's last save and every test question. */
export function isRunCurrent({ run, draft, tests }: { run: PolicyTestRun | null; draft: WorkingPolicy; tests: PolicyTest[] }): boolean {
  if (!run || !draft.updatedAt) return false;
  const changedAt = [draft.updatedAt, ...tests.map((test) => test.updated_at)].map((time) => new Date(time).getTime());
  return new Date(run.ran_at).getTime() >= Math.max(...changedAt);
}
