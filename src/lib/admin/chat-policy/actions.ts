"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getErrorState, getFormValues, getSuccessState, type ActionState } from "@/lib/admin/action-state";
import { policyBodySchema, policyTestSchema, type PolicyTestInput } from "@/lib/admin/chat-policy/policy-schema";
import { fetchTestsChangedAt } from "@/lib/admin/chat-policy/queries";
import { BATCH_SIZE, getAssembledResults, getBatchCount, getBatchSlots, getDoneCount, getOrderedTestIds, getRunTotal, isSameQuestionSet, type TestBatchProgress, type TestRunStart, type TestSlot } from "@/lib/admin/chat-policy/test-batches";
import { deleteStaleTestJobs, deleteTestJob, fetchTestJob, fetchTestParts, insertTestJob, insertTestPart, type TestJob } from "@/lib/admin/chat-policy/test-jobs";
import { MAX_TESTS, TEST_LIMIT_MESSAGE, isAtTestLimit } from "@/lib/admin/chat-policy/test-rows";
import { fetchTestResults } from "@/lib/admin/chat-policy/test-runner";
import { getRunSummary, hasCurrentChecksVersion, hasCurrentSafetyChecks, type PolicyTestCase, type PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";
import { getDatabaseErrorMessage, isUniqueViolation } from "@/lib/admin/database-errors";
import { getLoaded, getLoadFailure, getQueryLoad, type LoadFailure, type LoadResult } from "@/lib/admin/load-result";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { OWNER_ROLES, type AdminContext } from "@/lib/admin/require-admin";
import { runAdminAction } from "@/lib/admin/run-admin-action";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import type { AnswerModel } from "@/lib/chat/answer-question";
import { getClaudeAnswerModel } from "@/lib/chat/claude-model";
import { noteProblemCause, type ProblemCause } from "@/lib/observability/action-context";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { reportProblem } from "@/lib/observability/report-problem";
import { createServiceClient } from "@/lib/supabase/service-client";

// Chatbot policy (Admin §6): owners only, checked here, in the page, and by RLS.

const POLICY_PATH = "/admin/chat-policy";
const NO_MODEL_MESSAGE = "The chat assistant isn't connected yet (no Anthropic API key), so tests can't run. The site owner adds the key at launch.";
const NO_MODEL_CAUSE: ProblemCause = { stage: "setup", severity: "warning", code: "no_api_key", detail: null };
const RUN_ENDED_MESSAGE = "This test run has ended. Run the tests again.";
const DRAFT_CHANGED_MESSAGE = "The draft changed while the tests ran. Run the tests again.";
const QUESTIONS_CHANGED_MESSAGE = "The test questions changed while the tests ran. Run the tests again.";
const RUN_SIZE_CHANGED_MESSAGE = "The safety checks changed during this run. Run the tests again.";
const NO_PUBLISH_RUN_MESSAGE = "Run the tests and pass them on this draft before publishing.";
const SAFETY_CHECKS_OUTDATED_MESSAGE = "Run the tests again: the safety checks were updated since the last run.";
const LATEST_RUN_FAILED_MESSAGE = "Your latest test run had failures. Fix them and run the tests again.";
const DRAFT_CHANGED_ELSEWHERE_MESSAGE = "This draft changed in another window or by a restore. Copy your edits, then reload the page.";

type DraftRow = { id: string; version: number; updated_at: string };

/** What a restore reports, so the page can offer Undo only when the open draft was replaced. */
export type RestoreResult = QuickResult & { draftId?: string; updatedAt?: string; didReplace?: boolean };

type DatabaseError = { code?: string; message: string };

/** updated is null when no open draft matched (none, or it was published meanwhile). */
type DraftUpdate = { updated: DraftRow | null; error: DatabaseError | null };

// A read failed: never reported as "no longer exists" or "add a question first".
function noteLoadCause(error: DatabaseError): void {
  noteProblemCause({ stage: "load", severity: "error", code: error.code ?? "database", detail: error.message });
}

/** expectedUpdatedAt: save only over the text the editor last saw (two windows, or a restore since; bug 12). */
async function updateDraft({ supabase, tenantId }: AdminContext, { draftId, body, expectedUpdatedAt }: { draftId: string; body: string; expectedUpdatedAt?: string }): Promise<DraftUpdate> {
  const query = supabase.from("chat_policies").update({ body }).eq("tenant_id", tenantId).eq("id", draftId).eq("status", "draft");
  const guarded = expectedUpdatedAt ? query.eq("updated_at", expectedUpdatedAt) : query;
  const result = await guarded.select("id, version, updated_at").maybeSingle<DraftRow>();
  return { updated: result.data, error: result.error };
}

async function insertDraft({ supabase, tenantId }: AdminContext, body: string) {
  return supabase.from("chat_policies").insert({ tenant_id: tenantId, body }).select("id, version, updated_at").single<DraftRow>();
}

/** Whether the draft is still open: a guarded save that matched nothing then means it changed since. */
async function fetchIsStillDraft({ supabase, tenantId }: AdminContext, draftId: string): Promise<LoadResult<boolean>> {
  const result = await supabase.from("chat_policies").select("id").eq("tenant_id", tenantId).eq("id", draftId).eq("status", "draft").maybeSingle<{ id: string }>();
  if (result.error) return getLoadFailure("draft to save", result.error);
  return getLoaded(result.data !== null);
}

type DraftSave = { admin: AdminContext; values: Record<string, string>; body: string };

/** The saved draft's state, or null when there is no open draft to save over (then a new one starts). */
async function fetchSavedOverDraft({ admin, values, body }: DraftSave): Promise<ActionState | null> {
  const draftId = z.uuid().safeParse(values.draftId).data;
  if (!draftId) return null;
  const expectedUpdatedAt = values.expectedUpdatedAt || undefined;
  const { updated, error } = await updateDraft(admin, { draftId, body, expectedUpdatedAt });
  if (error) return getErrorState({ message: getDatabaseErrorMessage(error), values });
  if (updated) return getSuccessState(`Draft version ${updated.version} saved. Run the tests before publishing.`);
  if (!expectedUpdatedAt) return null;
  const isStillDraft = await fetchIsStillDraft(admin, draftId);
  if (!isStillDraft.isLoaded) return getErrorState({ message: "We couldn't check the draft. Try again in a moment.", values });
  // Still a draft: someone changed it since. Published or gone: start a new draft, as before.
  return isStillDraft.data ? getErrorState({ message: DRAFT_CHANGED_ELSEWHERE_MESSAGE, values }) : null;
}

async function fetchSavedNewDraft({ admin, values, body }: DraftSave): Promise<ActionState> {
  const { data, error } = await insertDraft(admin, body);
  if (error || !data) return getErrorState({ message: error ? getDatabaseErrorMessage(error) : "The draft was not saved.", values });
  return getSuccessState(`Saved as draft version ${data.version}. Run the tests before publishing.`);
}

/** Saves over the open draft, or starts a new version when there is none (or it was published meanwhile). */
export async function savePolicyDraftAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction({ action: "chat_policy.save_draft", roles: OWNER_ROLES }, async (admin) => {
    const values = getFormValues(formData);
    const parsed = policyBodySchema.safeParse(values.body ?? "");
    if (!parsed.success) return getErrorState({ message: "Fix the policy text.", fieldErrors: { body: parsed.error.issues[0]?.message ?? "Check the policy text" }, values });
    const save = { admin, values, body: parsed.data };
    const state = (await fetchSavedOverDraft(save)) ?? (await fetchSavedNewDraft(save));
    if (state.status === "success") revalidatePath(POLICY_PATH);
    return state;
  });
}

type RestoreSource = { id: string; body: string; version: number };

/** The open working draft: the newest version, when it is a draft (the same rule as the page's editor). */
async function fetchWorkingDraftId({ supabase, tenantId }: AdminContext): Promise<LoadResult<string | null>> {
  const result = await supabase.from("chat_policies").select("id, status").eq("tenant_id", tenantId).order("version", { ascending: false }).limit(1).maybeSingle<{ id: string; status: string }>();
  if (result.error) return getLoadFailure("open draft", result.error);
  return getLoaded(result.data?.status === "draft" ? result.data.id : null);
}

/** Copies the source into the open draft; null when it was published meanwhile (then a new draft starts). */
async function fetchReplacedDraft(admin: AdminContext, { source, draftId }: { source: RestoreSource; draftId: string }): Promise<RestoreResult | null> {
  const { updated, error } = await updateDraft(admin, { draftId, body: source.body });
  if (error) return getQuickError(getDatabaseErrorMessage(error));
  if (!updated) return null;
  const message = `Version ${source.version} copied into your open draft (version ${updated.version}). Run the tests again before publishing.`;
  return { ...getQuickSuccess(message), draftId: updated.id, updatedAt: updated.updated_at, didReplace: true };
}

async function fetchInsertedDraft(admin: AdminContext, source: RestoreSource): Promise<RestoreResult> {
  const { data, error } = await insertDraft(admin, source.body);
  if (error || !data) return getQuickError(error ? getDatabaseErrorMessage(error) : "The version was not restored.");
  return { ...getQuickSuccess(`Version ${source.version} copied into new draft version ${data.version}. Test it, then publish.`), draftId: data.id, updatedAt: data.updated_at, didReplace: false };
}

/** Restore (bug 12): into the open draft when there is one, otherwise as a new draft. */
async function fetchRestoredDraft(admin: AdminContext, source: RestoreSource): Promise<RestoreResult> {
  const workingDraftId = await fetchWorkingDraftId(admin);
  if (!workingDraftId.isLoaded) return noteLoadError(workingDraftId.failure, "We couldn't load your open draft. Try again in a moment.");
  if (workingDraftId.data === source.id) return getQuickError("That version is already your open draft.");
  const replaced = workingDraftId.data ? await fetchReplacedDraft(admin, { source, draftId: workingDraftId.data }) : null;
  return replaced ?? (await fetchInsertedDraft(admin, source));
}

export async function restorePolicyVersionAction(policyId: string): Promise<RestoreResult> {
  return runQuickAction<RestoreResult>({ action: "chat_policy.restore_version", roles: OWNER_ROLES }, async (admin) => {
    const { data: source, error: readError } = await admin.supabase.from("chat_policies").select("id, body, version").eq("tenant_id", admin.tenantId).eq("id", z.uuid().parse(policyId)).maybeSingle<RestoreSource>();
    if (readError) {
      noteLoadCause(readError);
      return getQuickError("We couldn't load that version. Try again in a moment.");
    }
    if (!source) return getQuickError("That version no longer exists.");
    const result = await fetchRestoredDraft(admin, source);
    if (result.status === "success") revalidatePath(POLICY_PATH);
    return result;
  });
}

type PublishDraft = { updated_at: string };

/**
 * The draft's newest run with the database's own stamps (cwr.publish_chat_policy), passed or not,
 * or null. Bug 14: a later failed run blocks publishing, as the page already shows.
 */
async function fetchPublishRunResults(admin: AdminContext, { policyId, draft, testsChangedAt }: { policyId: string; draft: PublishDraft; testsChangedAt: string | null }) {
  const base = admin.supabase.from("chat_policy_test_runs").select("is_passed, results").eq("tenant_id", admin.tenantId).eq("policy_id", policyId).eq("policy_updated_at", draft.updated_at);
  const stamped = testsChangedAt === null ? base.is("tests_updated_at", null) : base.eq("tests_updated_at", testsChangedAt);
  const result = await stamped.order("ran_at", { ascending: false }).limit(1).maybeSingle<{ is_passed: boolean; results: PolicyTestResult[] }>();
  return getQueryLoad({ part: "test run to publish", result, empty: null });
}

async function fetchPublishDraft({ supabase, tenantId }: AdminContext, policyId: string) {
  const result = await supabase.from("chat_policies").select("updated_at").eq("tenant_id", tenantId).eq("id", policyId).eq("status", "draft").maybeSingle<PublishDraft>();
  return getQueryLoad({ part: "draft to publish", result, empty: null });
}

/**
 * docs/cwr-chatbot-alignment-plan.md, Part 2 A5: the run that lets a draft publish must show every
 * current built-in safety check passing, under the current version, with approved wording. The
 * database trigger still applies after this.
 */
async function fetchPublishBlocker(admin: AdminContext, policyId: string): Promise<QuickResult | null> {
  const draft = await fetchPublishDraft(admin, policyId);
  if (!draft.isLoaded) return noteLoadError(draft.failure, "We couldn't load the draft. Try again in a moment.");
  if (!draft.data) return getQuickError("Only a saved draft can be published.");
  const testsChangedAt = await fetchTestsChangedAt(admin);
  if (!testsChangedAt.isLoaded) return noteLoadError(testsChangedAt.failure, "We couldn't load the test questions. Try again in a moment.");
  const run = await fetchPublishRunResults(admin, { policyId, draft: draft.data, testsChangedAt: testsChangedAt.data });
  if (!run.isLoaded) return noteLoadError(run.failure, "We couldn't load the last test run. Try again in a moment.");
  if (!run.data) return noteStoppedRunError({ code: "no_publish_run", message: NO_PUBLISH_RUN_MESSAGE });
  if (!run.data.is_passed) return noteStoppedRunError({ code: "latest_run_failed", message: LATEST_RUN_FAILED_MESSAGE });
  if (!hasCurrentSafetyChecks(run.data.results)) return noteStoppedRunError({ code: "safety_checks_outdated", message: SAFETY_CHECKS_OUTDATED_MESSAGE });
  return null;
}

export async function publishPolicyAction(policyId: string): Promise<QuickResult> {
  return runQuickAction({ action: "chat_policy.publish", roles: OWNER_ROLES }, async (admin) => {
    const draftId = z.uuid().parse(policyId);
    const blocker = await fetchPublishBlocker(admin, draftId);
    if (blocker) return blocker;
    const { error } = await admin.supabase.rpc("transition", { p_workflow_key: "chat_policy_status", p_record_id: draftId, p_to_state: "published" });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    revalidatePath(POLICY_PATH);
    return getQuickSuccess("Published. The chat assistant now answers from this version.");
  });
}

/**
 * The owner's off switch (decision D4): off, every visitor is offered a person and the model
 * is never called. The database lets only owners change it.
 */
export async function setAssistantOnAction({ isOn }: { isOn: boolean }): Promise<QuickResult> {
  return runQuickAction({ action: "chat_policy.set_assistant", roles: OWNER_ROLES }, async ({ supabase, tenantId }) => {
    const { data, error } = await supabase.from("site_settings").update({ is_assistant_on: z.boolean().parse(isOn) }).eq("tenant_id", tenantId).select("is_assistant_on").maybeSingle<{ is_assistant_on: boolean }>();
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!data) return getQuickError("The site settings are missing, so the switch didn't change. Save the contact details first.");
    revalidatePath(POLICY_PATH);
    return getQuickSuccess(isOn ? "The chat assistant is on. Visitors get answers from the live policy." : "The chat assistant is off. Every visitor is offered a person.");
  });
}

// ------------------------------------------------------------------ test questions

/** A message when no more questions can be added (the limit, or the count didn't load). */
async function fetchTestLimitError({ supabase, tenantId }: AdminContext): Promise<string | null> {
  const { count, error } = await supabase.from("chat_policy_tests").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true);
  if (error) {
    noteLoadCause(error);
    return "We couldn't check how many test questions there are. Try again in a moment.";
  }
  if (!isAtTestLimit(count ?? 0)) return null;
  noteProblemCause({ stage: "rule", severity: "info", code: "test_limit", detail: null });
  return TEST_LIMIT_MESSAGE;
}

function getTestRow(input: z.infer<typeof policyTestSchema>) {
  return { question: input.question, expected_outcome: input.expectedOutcome, expected_section: input.expectedSection || null };
}

export async function addPolicyTestAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAdminAction({ action: "chat_policy.add_test", roles: OWNER_ROLES }, async (admin) => {
    const values = getFormValues(formData);
    const parsed = policyTestSchema.safeParse({ question: values.question ?? "", expectedOutcome: values.expectedOutcome, expectedSection: values.expectedSection ?? "" });
    if (!parsed.success) {
      const fieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
      return getErrorState({ message: "Fix the highlighted fields.", fieldErrors, values });
    }
    const limitError = await fetchTestLimitError(admin);
    if (limitError) return getErrorState({ message: limitError, values });
    const { error } = await admin.supabase.from("chat_policy_tests").insert({ tenant_id: admin.tenantId, ...getTestRow(parsed.data) });
    if (error) return getErrorState({ message: getDatabaseErrorMessage(error), values });
    revalidatePath(POLICY_PATH);
    return getSuccessState("Test question added.");
  });
}

export async function restorePolicyTestAction(input: PolicyTestInput): Promise<QuickResult> {
  return runQuickAction({ action: "chat_policy.restore_test", roles: OWNER_ROLES }, async (admin) => {
    const testRow = getTestRow(policyTestSchema.parse(input));
    const limitError = await fetchTestLimitError(admin);
    if (limitError) return getQuickError(limitError);
    const { error } = await admin.supabase.from("chat_policy_tests").insert({ tenant_id: admin.tenantId, ...testRow });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    revalidatePath(POLICY_PATH);
    return getQuickSuccess("Test question restored.");
  });
}

export async function removePolicyTestAction(testId: string): Promise<QuickResult> {
  return runQuickAction({ action: "chat_policy.remove_test", roles: OWNER_ROLES }, async ({ supabase, tenantId }) => {
    const { data, error } = await supabase.from("chat_policy_tests").delete().eq("tenant_id", tenantId).eq("id", z.uuid().parse(testId)).select("id");
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!data?.length) return getQuickError("That question was already removed.");
    revalidatePath(POLICY_PATH);
    return getQuickSuccess("Test question removed.");
  });
}

// ------------------------------------------------------------------ test run, in batches
// docs/cwr-chat-policy-test-batches-plan.md, Part A: start fixes the questions, the browser asks
// for one batch per request, and finish saves the run once every batch is in.

type DraftToTest = { id: string; body: string; updated_at: string };
type ActiveTestRow = { id: string; updated_at: string };
type TestQuestionRow = { id: string; question: string; expected_outcome: PolicyTestCase["expectedOutcome"]; expected_section: string | null };
type BatchInputs = { job: TestJob; batchIndex: number; draft: DraftToTest; model: AnswerModel; testCases: PolicyTestCase[] };

function noteNoModelError(): QuickResult {
  noteProblemCause(NO_MODEL_CAUSE);
  return getQuickError(NO_MODEL_MESSAGE);
}

/** The run can't go on (it ended, or the draft or questions changed): the person's normal edit, recorded as info. */
function noteStoppedRunError({ code, message }: { code: string; message: string }): QuickResult {
  noteProblemCause({ stage: "rule", severity: "info", code, detail: null });
  return getQuickError(message);
}

/** A run that spans a change to the built-in safety checks can't be trusted (Part 2 D2). */
function noteRunSizeChangedError(): QuickResult {
  noteProblemCause({ stage: "rule", severity: "warning", code: "run_size_changed", detail: null });
  return getQuickError(RUN_SIZE_CHANGED_MESSAGE);
}

function noteLoadError(failure: LoadFailure, message: string): QuickResult {
  noteProblemCause({ stage: "load", severity: "error", code: failure.code ?? "database", detail: failure.detail });
  return getQuickError(message);
}

// Clean-up that fails never blocks a run; it is recorded so it can be looked at.
async function reportCleanupFailure(action: ProblemAction, error: DatabaseError | null): Promise<void> {
  if (!error) return;
  await reportProblem({ action, stage: "database", severity: "warning", code: error.code ?? "database", detail: error.message });
}

/** A message when the draft can't be tested (read failed, or it isn't a saved draft). */
async function fetchDraftToTest({ supabase, tenantId }: AdminContext, policyId: string): Promise<DraftToTest | { error: string }> {
  const { data, error } = await supabase.from("chat_policies").select("id, body, updated_at").eq("tenant_id", tenantId).eq("id", policyId).eq("status", "draft").maybeSingle<DraftToTest>();
  if (error) {
    noteLoadCause(error);
    return { error: "We couldn't load the draft to test. Try again in a moment." };
  }
  return data ?? { error: "Only a saved draft can be tested. Save your changes first." };
}

/** The active questions a run tests: the same limit the page shows (MAX_TESTS). */
async function fetchActiveTests({ supabase, tenantId }: AdminContext): Promise<LoadResult<ActiveTestRow[]>> {
  const result = await supabase.from("chat_policy_tests").select("id, updated_at").eq("tenant_id", tenantId).eq("is_active", true).order("updated_at", { ascending: false }).limit(MAX_TESTS).returns<ActiveTestRow[]>();
  return getQueryLoad({ part: "test questions", result, empty: [] });
}

/** null when the run has ended, was cleared, or belongs to someone else. */
async function fetchOwnedJob(admin: AdminContext, runKey: string): Promise<TestJob | { error: QuickResult }> {
  const job = await fetchTestJob({ tenantId: admin.tenantId, userId: admin.userId, runKey: z.uuid().parse(runKey) });
  if (!job.isLoaded) return { error: noteLoadError(job.failure, "We couldn't load this test run. Try again in a moment.") };
  return job.data ?? { error: noteStoppedRunError({ code: "run_ended", message: RUN_ENDED_MESSAGE }) };
}

function getTestCase(row: TestQuestionRow): PolicyTestCase {
  return { question: row.question, expectedOutcome: row.expected_outcome, expectedSection: row.expected_section, isBuiltIn: false };
}

/** The batch's questions in the run's order; a question removed since the start stops the run. */
async function fetchBatchTestCases({ supabase, tenantId }: AdminContext, slots: TestSlot[]): Promise<PolicyTestCase[] | { error: QuickResult }> {
  const testIds = slots.flatMap((slot) => (slot.kind === "owner" ? [slot.testId] : []));
  const result = testIds.length === 0 ? { data: [], error: null } : await supabase.from("chat_policy_tests").select("id, question, expected_outcome, expected_section").eq("tenant_id", tenantId).eq("is_active", true).in("id", testIds).returns<TestQuestionRow[]>();
  if (result.error) return { error: noteLoadError({ part: "test questions", code: result.error.code ?? null, detail: result.error.message }, "We couldn't load the test questions. Try again in a moment.") };
  const rowsById = new Map((result.data ?? []).map((row) => [row.id, row]));
  if (testIds.some((testId) => !rowsById.has(testId))) return { error: noteStoppedRunError({ code: "questions_changed", message: QUESTIONS_CHANGED_MESSAGE }) };
  return slots.flatMap((slot) => {
    if (slot.kind === "built_in") return [slot.testCase];
    const row = rowsById.get(slot.testId);
    return row ? [getTestCase(row)] : [];
  });
}

async function fetchBatchInputs(admin: AdminContext, { runKey, batchIndex }: { runKey: string; batchIndex: number }): Promise<BatchInputs | { error: QuickResult }> {
  const job = await fetchOwnedJob(admin, runKey);
  if ("error" in job) return job;
  const index = z.number().int().min(0).max(job.batch_count - 1).parse(batchIndex);
  if (getBatchCount(job.test_ids) !== job.batch_count) return { error: noteRunSizeChangedError() };
  const draft = await fetchDraftToTest(admin, job.policy_id);
  if ("error" in draft) return { error: getQuickError(draft.error) };
  if (draft.updated_at !== job.policy_updated_at) return { error: noteStoppedRunError({ code: "draft_changed", message: DRAFT_CHANGED_MESSAGE }) };
  const model = getClaudeAnswerModel();
  if (!model) return { error: noteNoModelError() };
  const testCases = await fetchBatchTestCases(admin, getBatchSlots({ testIds: job.test_ids, batchIndex: index }));
  if ("error" in testCases) return testCases;
  return { job, batchIndex: index, draft, model, testCases };
}

/** Every batch's results in order, or the reason the run can't be saved. */
async function fetchRunResults(job: TestJob): Promise<PolicyTestResult[] | { error: QuickResult }> {
  const parts = await fetchTestParts(job.run_key);
  if (!parts.isLoaded) return { error: noteLoadError(parts.failure, "We couldn't load the test results. Try again in a moment.") };
  const results = getAssembledResults({ parts: parts.data, batchCount: job.batch_count });
  if (results) return results;
  noteProblemCause({ stage: "rule", severity: "warning", code: "missing_batch", detail: `${parts.data.length} of ${job.batch_count} batches saved` });
  return { error: getQuickError("Some questions weren't tested. Run the tests again.") };
}

async function fetchIsSameQuestionSet(admin: AdminContext, job: TestJob): Promise<boolean | { error: QuickResult }> {
  const tests = await fetchActiveTests(admin);
  if (!tests.isLoaded) return { error: noteLoadError(tests.failure, "We couldn't load the test questions. Try again in a moment.") };
  return isSameQuestionSet({ runTestIds: job.test_ids, currentTestIds: tests.data.map((test) => test.id) });
}

async function saveTestRun({ job, results, userId }: { job: TestJob; results: PolicyTestResult[]; userId: string }) {
  return createServiceClient().rpc("record_chat_policy_test_run", {
    p_policy_id: job.policy_id,
    p_policy_updated_at: job.policy_updated_at,
    p_tests_updated_at: job.tests_updated_at,
    p_is_passed: results.every((result) => result.isPassed),
    p_results: results,
    p_ran_by: userId,
  });
}

/** Fixes the run's questions; asks the model nothing. */
export async function startPolicyTestRunAction(policyId: string): Promise<TestRunStart | QuickResult> {
  return runQuickAction<TestRunStart>({ action: "chat_policy.start_tests", roles: OWNER_ROLES }, async (admin) => {
    if (!getClaudeAnswerModel()) return noteNoModelError();
    const draft = await fetchDraftToTest(admin, z.uuid().parse(policyId));
    if ("error" in draft) return getQuickError(draft.error);
    // The stamp covers every question, active or not, as the database's save check does.
    const testsChangedAt = await fetchTestsChangedAt(admin);
    if (!testsChangedAt.isLoaded) return noteLoadError(testsChangedAt.failure, "We couldn't load the test questions. Try again in a moment.");
    const tests = await fetchActiveTests(admin);
    if (!tests.isLoaded) return noteLoadError(tests.failure, "We couldn't load the test questions. Try again in a moment.");
    if (tests.data.length === 0) return getQuickError("Add at least one test question first.");
    await reportCleanupFailure("chat_policy.start_tests", await deleteStaleTestJobs(admin.tenantId));
    const testIds = getOrderedTestIds(tests.data);
    const batchCount = getBatchCount(testIds);
    const job = await insertTestJob({ tenantId: admin.tenantId, userId: admin.userId, policyId: draft.id, policyUpdatedAt: draft.updated_at, testsUpdatedAt: testsChangedAt.data, testIds, batchSize: BATCH_SIZE, batchCount });
    if (!job.isLoaded) return noteLoadError(job.failure, "The test run didn't start. Try again in a moment.");
    return { ...getQuickSuccess("Testing started."), runKey: job.data, batchCount, total: getRunTotal(testIds) };
  });
}

/** Tests one batch (at most BATCH_SIZE questions) and saves its results once. */
export async function runPolicyTestBatchAction(input: { runKey: string; batchIndex: number }): Promise<TestBatchProgress | QuickResult> {
  return runQuickAction<TestBatchProgress>({ action: "chat_policy.run_tests", roles: OWNER_ROLES }, async (admin) => {
    const inputs = await fetchBatchInputs(admin, input);
    if ("error" in inputs) return inputs.error;
    const { job, batchIndex, draft, model, testCases } = inputs;
    const results = await fetchTestResults({ policyBody: draft.body, testCases, model, batchLabel: `batch ${batchIndex + 1} of ${job.batch_count}` });
    const error = await insertTestPart({ runKey: job.run_key, batchIndex, results });
    if (error) return getQuickError(isUniqueViolation(error) ? "These questions were already tested in this run. Run the tests again." : getDatabaseErrorMessage(error));
    const done = getDoneCount({ testIds: job.test_ids, batchIndex });
    return { ...getQuickSuccess(`Tested ${done} questions.`), done, total: getRunTotal(job.test_ids) };
  });
}

/** Saves the run once every batch is in and the questions are still the ones it started with. */
export async function finishPolicyTestRunAction({ runKey }: { runKey: string }): Promise<QuickResult> {
  return runQuickAction({ action: "chat_policy.finish_tests", roles: OWNER_ROLES }, async (admin) => {
    const job = await fetchOwnedJob(admin, runKey);
    if ("error" in job) return job.error;
    const results = await fetchRunResults(job);
    if ("error" in results) return results.error;
    if (results.length !== getRunTotal(job.test_ids) || !hasCurrentChecksVersion(results)) return noteRunSizeChangedError();
    const isSameSet = await fetchIsSameQuestionSet(admin, job);
    if (typeof isSameSet !== "boolean") return isSameSet.error;
    if (!isSameSet) return noteStoppedRunError({ code: "questions_changed", message: QUESTIONS_CHANGED_MESSAGE });
    const { error } = await saveTestRun({ job, results, userId: admin.userId });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    await reportCleanupFailure("chat_policy.finish_tests", await deleteTestJob(job.run_key));
    return results.every((result) => result.isPassed) ? getQuickSuccess(getRunSummary(results)) : getQuickError(getRunSummary(results));
  });
}
