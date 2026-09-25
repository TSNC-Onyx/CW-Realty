"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { policyBodySchema, policyTestSchema, type PolicyTestInput } from "@/lib/admin/chat-policy/policy-schema";
import { fetchTestResults } from "@/lib/admin/chat-policy/test-runner";
import { BUILT_IN_TEST_CASES, getRunSummary, type PolicyTestCase, type PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";
import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { OWNER_ROLES, type AdminContext } from "@/lib/admin/require-admin";
import { runAdminAction } from "@/lib/admin/run-admin-action";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { getClaudeAnswerModel } from "@/lib/chat/claude-model";
import { createServiceClient } from "@/lib/supabase/service-client";

// Chatbot policy (Admin §6): owners only, checked here, in the page, and by RLS.

const POLICY_PATH = "/admin/chat-policy";
const NO_MODEL_MESSAGE = "The chat assistant isn't connected yet (no Anthropic API key), so tests can't run. The site owner adds the key at launch.";

type DraftRow = { id: string; version: number };

async function updateDraft({ supabase, tenantId }: AdminContext, { draftId, body }: { draftId: string; body: string }): Promise<DraftRow | null> {
  const { data } = await supabase.from("chat_policies").update({ body }).eq("tenant_id", tenantId).eq("id", draftId).eq("status", "draft").select("id, version").maybeSingle<DraftRow>();
  return data;
}

async function insertDraft({ supabase, tenantId }: AdminContext, body: string) {
  return supabase.from("chat_policies").insert({ tenant_id: tenantId, body }).select("id, version").single<DraftRow>();
}

/** Saves over the open draft, or starts a new version when there is none (or it was published meanwhile). */
export async function savePolicyDraftAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction(OWNER_ROLES, async (admin) => {
    const values = getFormValues(formData);
    const parsed = policyBodySchema.safeParse(values.body ?? "");
    if (!parsed.success) return getErrorState({ message: "Fix the policy text.", fieldErrors: { body: parsed.error.issues[0]?.message ?? "Check the policy text" }, values });
    const draftId = z.uuid().safeParse(values.draftId).data;
    const updated = draftId ? await updateDraft(admin, { draftId, body: parsed.data }) : null;
    if (updated) {
      revalidatePath(POLICY_PATH);
      return getSuccessState(`Draft version ${updated.version} saved. Run the tests before publishing.`);
    }
    const { data, error } = await insertDraft(admin, parsed.data);
    if (error || !data) return getErrorState({ message: error ? getDatabaseErrorMessage(error) : "The draft was not saved.", values });
    revalidatePath(POLICY_PATH);
    return getSuccessState(`Saved as draft version ${data.version}. Run the tests before publishing.`);
  });
}

export async function restorePolicyVersionAction(policyId: string): Promise<QuickResult> {
  return runQuickAction(OWNER_ROLES, async (admin) => {
    const { data: source } = await admin.supabase.from("chat_policies").select("body, version").eq("tenant_id", admin.tenantId).eq("id", z.uuid().parse(policyId)).maybeSingle<{ body: string; version: number }>();
    if (!source) return getQuickError("That version no longer exists.");
    const { data, error } = await insertDraft(admin, source.body);
    if (error || !data) return getQuickError(error ? getDatabaseErrorMessage(error) : "The version was not restored.");
    revalidatePath(POLICY_PATH);
    return getQuickSuccess(`Version ${source.version} copied into new draft version ${data.version}. Test it, then publish.`);
  });
}

export async function publishPolicyAction(policyId: string): Promise<QuickResult> {
  return runQuickAction(OWNER_ROLES, async ({ supabase }) => {
    const { error } = await supabase.rpc("transition", { p_workflow_key: "chat_policy_status", p_record_id: z.uuid().parse(policyId), p_to_state: "published" });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    revalidatePath(POLICY_PATH);
    return getQuickSuccess("Published. The chat assistant now answers from this version.");
  });
}

// ------------------------------------------------------------------ test questions

function getTestRow(input: z.infer<typeof policyTestSchema>) {
  return { question: input.question, expected_outcome: input.expectedOutcome, expected_section: input.expectedSection || null };
}

export async function addPolicyTestAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction(OWNER_ROLES, async ({ supabase, tenantId }) => {
    const values = getFormValues(formData);
    const parsed = policyTestSchema.safeParse({ question: values.question ?? "", expectedOutcome: values.expectedOutcome, expectedSection: values.expectedSection ?? "" });
    if (!parsed.success) {
      const fieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
      return getErrorState({ message: "Fix the highlighted fields.", fieldErrors, values });
    }
    const { error } = await supabase.from("chat_policy_tests").insert({ tenant_id: tenantId, ...getTestRow(parsed.data) });
    if (error) return getErrorState({ message: getDatabaseErrorMessage(error), values });
    revalidatePath(POLICY_PATH);
    return getSuccessState("Test question added.");
  });
}

export async function restorePolicyTestAction(input: PolicyTestInput): Promise<QuickResult> {
  return runQuickAction(OWNER_ROLES, async ({ supabase, tenantId }) => {
    const { error } = await supabase.from("chat_policy_tests").insert({ tenant_id: tenantId, ...getTestRow(policyTestSchema.parse(input)) });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    revalidatePath(POLICY_PATH);
    return getQuickSuccess("Test question restored.");
  });
}

export async function removePolicyTestAction(testId: string): Promise<QuickResult> {
  return runQuickAction(OWNER_ROLES, async ({ supabase, tenantId }) => {
    const { data, error } = await supabase.from("chat_policy_tests").delete().eq("tenant_id", tenantId).eq("id", z.uuid().parse(testId)).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!data?.length) return getQuickError("That question was already removed.");
    revalidatePath(POLICY_PATH);
    return getQuickSuccess("Test question removed.");
  });
}

// ------------------------------------------------------------------ test run

type DraftToTest = { id: string; body: string; updated_at: string };
type TestRow = { question: string; expected_outcome: PolicyTestCase["expectedOutcome"]; expected_section: string | null; is_active: boolean; updated_at: string };

async function fetchDraftToTest({ supabase, tenantId }: AdminContext, policyId: string): Promise<DraftToTest | null> {
  const { data } = await supabase.from("chat_policies").select("id, body, updated_at").eq("tenant_id", tenantId).eq("id", policyId).eq("status", "draft").maybeSingle<DraftToTest>();
  return data;
}

/** One read, so the questions asked and the "changed at" stamp always describe the same set. */
async function fetchTestCases({ supabase, tenantId }: AdminContext): Promise<{ testCases: PolicyTestCase[]; changedAt: string | null }> {
  const { data } = await supabase.from("chat_policy_tests").select("question, expected_outcome, expected_section, is_active, updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).returns<TestRow[]>();
  const rows = data ?? [];
  const testCases = rows.filter((row) => row.is_active).map((row) => ({ question: row.question, expectedOutcome: row.expected_outcome, expectedSection: row.expected_section, isBuiltIn: false }));
  return { testCases, changedAt: rows[0]?.updated_at ?? null };
}

async function saveTestRun({ draft, changedAt, results, userId }: { draft: DraftToTest; changedAt: string | null; results: PolicyTestResult[]; userId: string }) {
  return createServiceClient().rpc("record_chat_policy_test_run", {
    p_policy_id: draft.id,
    p_policy_updated_at: draft.updated_at,
    p_tests_updated_at: changedAt,
    p_is_passed: results.every((result) => result.isPassed),
    p_results: results,
    p_ran_by: userId,
  });
}

export async function runPolicyTestsAction(policyId: string): Promise<QuickResult> {
  return runQuickAction(OWNER_ROLES, async (admin) => {
    const draft = await fetchDraftToTest(admin, z.uuid().parse(policyId));
    if (!draft) return getQuickError("Only a saved draft can be tested. Save your changes first.");
    const { testCases, changedAt } = await fetchTestCases(admin);
    if (testCases.length === 0) return getQuickError("Add at least one test question first.");
    const model = getClaudeAnswerModel();
    if (!model) return getQuickError(NO_MODEL_MESSAGE);
    const results = await fetchTestResults({ policyBody: draft.body, testCases: [...BUILT_IN_TEST_CASES, ...testCases], model });
    const { error } = await saveTestRun({ draft, changedAt, results, userId: admin.userId });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    revalidatePath(POLICY_PATH);
    return results.every((result) => result.isPassed) ? getQuickSuccess(getRunSummary(results)) : getQuickError(getRunSummary(results));
  });
}
