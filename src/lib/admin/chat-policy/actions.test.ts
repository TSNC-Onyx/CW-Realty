import { beforeEach, describe, expect, it, vi } from "vitest";

import { finishPolicyTestRunAction, publishPolicyAction, restorePolicyVersionAction, runPolicyTestBatchAction, savePolicyDraftAction, startPolicyTestRunAction } from "@/lib/admin/chat-policy/actions";
import { IDLE_ACTION_STATE } from "@/lib/admin/action-state";
import * as queries from "@/lib/admin/chat-policy/queries";
import { BATCH_SIZE } from "@/lib/admin/chat-policy/test-batches";
import type { TestJob } from "@/lib/admin/chat-policy/test-jobs";
import { BUILT_IN_TEST_CASES, SAFETY_CHECKS_VERSION, type PolicyTestCase, type PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";
import { HANDOFF_TEXT } from "@/lib/chat/handoff-text";

// The three test-run actions (docs/cwr-chat-policy-test-batches-plan.md, Part A), with the
// database, the model and the sign-in replaced by fakes.

const RUN_KEY = "11111111-1111-4111-8111-111111111111";
const DRAFT_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT = { id: DRAFT_ID, body: "# Office hours\nWeekdays.", updated_at: "2026-10-03T10:00:00Z" };
const OWNER_IDS = ["a0000000-0000-4000-8000-000000000001", "a0000000-0000-4000-8000-000000000002"];

type TableResult = { data: unknown; error: { code?: string; message: string } | null; count?: number };

const { tableResults, tableQueues, queryCalls, jobs, models, rpc, adminRpc, reportProblem } = vi.hoisted(() => ({
  tableResults: new Map<string, TableResult>(),
  /** Results handed out one call at a time (oldest first) before falling back to tableResults. */
  tableQueues: new Map<string, TableResult[]>(),
  queryCalls: [] as { table: string; method: string; args: unknown[] }[],
  jobs: {
    insertTestJob: vi.fn(),
    deleteStaleTestJobs: vi.fn(async () => null),
    fetchTestJob: vi.fn(),
    insertTestPart: vi.fn<(part: { runKey: string; batchIndex: number; results: PolicyTestResult[] }) => Promise<{ code?: string; message: string } | null>>(async () => null),
    fetchTestParts: vi.fn(),
    deleteTestJob: vi.fn(async () => null),
  },
  models: { getClaudeAnswerModel: vi.fn(() => ({}) as object | null), fetchTestResults: vi.fn() },
  rpc: vi.fn(async () => ({ data: "run-id", error: null })),
  adminRpc: vi.fn(async () => ({ data: null, error: null })),
  reportProblem: vi.fn(async () => ({ reference: "CWR-AAA-BBB", stored: true, isSuppressed: false })),
}));

/** A chainable stand-in for a Supabase query: every filter returns itself; awaiting it gives the table's result. */
function getFakeQuery(table: string) {
  const queued = tableQueues.get(table)?.shift();
  const result = () => queued ?? tableResults.get(table) ?? { data: [], error: null };
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "in", "order", "limit", "returns", "insert", "update", "single"]) {
    query[method] = (...args: unknown[]) => {
      queryCalls.push({ table, method, args });
      return query;
    };
  }
  query.maybeSingle = async () => result();
  query.then = (resolve: (value: TableResult) => unknown) => resolve(result());
  return query;
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/observability/report-problem", () => ({ reportProblem }));
vi.mock("@/lib/admin/require-admin", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireAdmin: vi.fn(async () => ({ tenantId: "tenant-a", userId: "owner-1", role: "owner", supabase: { from: getFakeQuery, rpc: adminRpc } })),
}));
vi.mock("@/lib/admin/chat-policy/test-jobs", () => jobs);
vi.mock("@/lib/admin/chat-policy/test-runner", () => ({ fetchTestResults: models.fetchTestResults }));
vi.mock("@/lib/chat/claude-model", () => ({ getClaudeAnswerModel: models.getClaudeAnswerModel }));
vi.mock("@/lib/admin/chat-policy/queries", () => ({ fetchTestsChangedAt: vi.fn(async () => ({ isLoaded: true, data: "2026-10-03T09:00:00Z" })) }));
vi.mock("@/lib/supabase/service-client", () => ({ createServiceClient: () => ({ rpc }) }));

function getJob(overrides: Partial<TestJob> = {}): TestJob {
  return { run_key: RUN_KEY, policy_id: DRAFT_ID, policy_updated_at: DRAFT.updated_at, tests_updated_at: "2026-10-03T09:00:00Z", test_ids: OWNER_IDS, batch_count: 2, ...overrides };
}

function getQuestionRows(testIds: string[]) {
  return testIds.map((id) => ({ id, question: `Question ${id}`, expected_outcome: "answer", expected_section: null }));
}

function getPassingResults(testCases: PolicyTestCase[]): PolicyTestResult[] {
  return testCases.map((testCase) => ({ ...testCase, outcome: testCase.expectedOutcome, reply: "Reply.", citedSections: [], isPassed: true }));
}

/** The built-in checks, passed with the approved wording; no checksVersion means a run from before the change. */
function getBuiltInResults(checksVersion?: string): PolicyTestResult[] {
  return BUILT_IN_TEST_CASES.map((testCase) => ({ ...testCase, outcome: "handoff", reply: HANDOFF_TEXT.needsPerson, citedSections: [], isPassed: true, isApprovedWording: true, ...(checksVersion ? { checksVersion } : {}) }));
}

/** A whole run of the 2 owner questions in its 2 batches: the 8 built-ins, then the 2 owner questions. null: built-ins from before the change. */
function getCompleteParts(checksVersion: string | null = SAFETY_CHECKS_VERSION) {
  const ownerResults = getPassingResults(getQuestionRows(OWNER_IDS).map((row) => ({ question: row.question, expectedOutcome: "answer", expectedSection: null, isBuiltIn: false })));
  const results = [...getBuiltInResults(checksVersion ?? undefined), ...ownerResults];
  return [
    { batchIndex: 0, results: results.slice(0, BATCH_SIZE) },
    { batchIndex: 1, results: results.slice(BATCH_SIZE) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  tableResults.clear();
  tableQueues.clear();
  queryCalls.length = 0;
  tableResults.set("chat_policies", { data: DRAFT, error: null });
  models.getClaudeAnswerModel.mockReturnValue({});
  models.fetchTestResults.mockImplementation(async ({ testCases }: { testCases: PolicyTestCase[] }) => getPassingResults(testCases));
  jobs.fetchTestJob.mockResolvedValue({ isLoaded: true, data: getJob() });
  jobs.insertTestPart.mockResolvedValue(null);
});

describe("startPolicyTestRunAction", () => {
  it("explains a missing API key and starts nothing", async () => {
    // Arrange
    models.getClaudeAnswerModel.mockReturnValue(null);

    // Act
    const result = await startPolicyTestRunAction(DRAFT_ID);

    // Assert
    expect({ message: result.message, isJobStarted: jobs.insertTestJob.mock.calls.length > 0 }).toEqual({ message: expect.stringContaining("isn't connected yet"), isJobStarted: false });
  });

  it("fixes the run's questions, newest change first, and asks the model nothing", async () => {
    // Arrange
    tableResults.set("chat_policy_tests", { data: [{ id: OWNER_IDS[0], updated_at: "2026-10-01T00:00:00Z" }, { id: OWNER_IDS[1], updated_at: "2026-10-02T00:00:00Z" }], error: null });
    jobs.insertTestJob.mockResolvedValue({ isLoaded: true, data: RUN_KEY });

    // Act
    const result = await startPolicyTestRunAction(DRAFT_ID);

    // Assert
    expect({ result, testIds: jobs.insertTestJob.mock.calls[0]?.[0].testIds, modelCalls: models.fetchTestResults.mock.calls.length }).toEqual({
      result: expect.objectContaining({ status: "success", runKey: RUN_KEY, batchCount: 2, total: 10 }),
      testIds: [OWNER_IDS[1], OWNER_IDS[0]],
      modelCalls: 0,
    });
  });

  it("asks for a question first when there are none", async () => {
    // Arrange
    tableResults.set("chat_policy_tests", { data: [], error: null });

    // Act
    const result = await startPolicyTestRunAction(DRAFT_ID);

    // Assert
    expect(result.message).toContain("Add at least one test question first.");
  });
});

describe("runPolicyTestBatchAction", () => {
  it("refuses a run it can't find for this person (someone else's, or already ended)", async () => {
    // Arrange
    jobs.fetchTestJob.mockResolvedValue({ isLoaded: true, data: null });

    // Act
    const result = await runPolicyTestBatchAction({ runKey: RUN_KEY, batchIndex: 0 });

    // Assert
    expect({ message: result.message, modelCalls: models.fetchTestResults.mock.calls.length }).toEqual({ message: expect.stringContaining("This test run has ended."), modelCalls: 0 });
  });

  it("looks the run up by the signed-in person, never only by its key", async () => {
    // Arrange
    tableResults.set("chat_policy_tests", { data: getQuestionRows(OWNER_IDS), error: null });

    // Act
    await runPolicyTestBatchAction({ runKey: RUN_KEY, batchIndex: 0 });

    // Assert
    expect(jobs.fetchTestJob).toHaveBeenCalledWith({ tenantId: "tenant-a", userId: "owner-1", runKey: RUN_KEY });
  });

  it("stops the run when a question was removed since it started", async () => {
    // Arrange
    tableResults.set("chat_policy_tests", { data: getQuestionRows([OWNER_IDS[1] as string]), error: null });

    // Act
    const result = await runPolicyTestBatchAction({ runKey: RUN_KEY, batchIndex: 1 });

    // Assert
    expect({ message: result.message, modelCalls: models.fetchTestResults.mock.calls.length }).toEqual({ message: expect.stringContaining("The test questions changed"), modelCalls: 0 });
  });

  it("stops the run when the draft was edited since it started", async () => {
    // Arrange
    tableResults.set("chat_policies", { data: { ...DRAFT, updated_at: "2026-10-03T11:00:00Z" }, error: null });

    // Act
    const result = await runPolicyTestBatchAction({ runKey: RUN_KEY, batchIndex: 0 });

    // Assert
    expect(result.message).toContain("The draft changed while the tests ran.");
  });

  it("refuses a batch number the run doesn't have", async () => {
    // Arrange / Act
    const result = await runPolicyTestBatchAction({ runKey: RUN_KEY, batchIndex: 1 });

    // Assert
    expect({ status: result.status, modelCalls: models.fetchTestResults.mock.calls.length }).toEqual({ status: "error", modelCalls: 0 });
  });

  it("refuses a batch that was already tested", async () => {
    // Arrange
    tableResults.set("chat_policy_tests", { data: getQuestionRows(OWNER_IDS), error: null });
    jobs.insertTestPart.mockResolvedValue({ code: "23505", message: "duplicate key" });

    // Act
    const result = await runPolicyTestBatchAction({ runKey: RUN_KEY, batchIndex: 0 });

    // Assert
    expect(result.message).toContain("already tested in this run");
  });

  it("tests at most one batch of questions per request", async () => {
    // Arrange
    const manyIds = Array.from({ length: 20 }, (_unused, index) => `b0000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    jobs.fetchTestJob.mockResolvedValue({ isLoaded: true, data: getJob({ test_ids: manyIds, batch_count: 4 }) });
    tableResults.set("chat_policy_tests", { data: getQuestionRows(manyIds), error: null });

    // Act
    const result = await runPolicyTestBatchAction({ runKey: RUN_KEY, batchIndex: 1 });

    // Assert
    expect({ result, questionsAsked: models.fetchTestResults.mock.calls[0]?.[0].testCases.length }).toEqual({ result: expect.objectContaining({ status: "success", done: 16, total: 28 }), questionsAsked: BATCH_SIZE });
  });

  it("saves the results the server got, never anything from the browser", async () => {
    // Arrange
    tableResults.set("chat_policy_tests", { data: getQuestionRows(OWNER_IDS), error: null });

    // Act
    await runPolicyTestBatchAction({ runKey: RUN_KEY, batchIndex: 0 });

    // Assert
    expect(jobs.insertTestPart.mock.calls[0]?.[0].results).toEqual(await models.fetchTestResults.mock.results[0]?.value);
  });
});

describe("finishPolicyTestRunAction", () => {
  it("refuses to save when a batch is missing", async () => {
    // Arrange
    jobs.fetchTestJob.mockResolvedValue({ isLoaded: true, data: getJob({ batch_count: 2 }) });
    jobs.fetchTestParts.mockResolvedValue({ isLoaded: true, data: [{ batchIndex: 0, results: [] }] });

    // Act
    const result = await finishPolicyTestRunAction({ runKey: RUN_KEY });

    // Assert
    expect({ message: result.message, isSaved: rpc.mock.calls.length > 0 }).toEqual({ message: expect.stringContaining("Some questions weren't tested."), isSaved: false });
  });

  it("refuses to save when a question was added since the run started", async () => {
    // Arrange
    jobs.fetchTestParts.mockResolvedValue({ isLoaded: true, data: getCompleteParts() });
    tableResults.set("chat_policy_tests", { data: [...OWNER_IDS, "c0000000-0000-4000-8000-000000000003"].map((id) => ({ id, updated_at: "2026-10-03T09:00:00Z" })), error: null });

    // Act
    const result = await finishPolicyTestRunAction({ runKey: RUN_KEY });

    // Assert
    expect({ message: result.message, isSaved: rpc.mock.calls.length > 0 }).toEqual({ message: expect.stringContaining("The test questions changed"), isSaved: false });
  });

  it("saves a complete run with the stamps it started from, then clears the job", async () => {
    // Arrange
    jobs.fetchTestParts.mockResolvedValue({ isLoaded: true, data: getCompleteParts() });
    tableResults.set("chat_policy_tests", { data: OWNER_IDS.map((id) => ({ id, updated_at: "2026-10-03T09:00:00Z" })), error: null });

    // Act
    const result = await finishPolicyTestRunAction({ runKey: RUN_KEY });

    // Assert
    expect({ status: result.status, saved: rpc.mock.calls[0], isCleared: jobs.deleteTestJob.mock.calls.length === 1 }).toEqual({
      status: "success",
      saved: ["record_chat_policy_test_run", expect.objectContaining({ p_policy_updated_at: DRAFT.updated_at, p_tests_updated_at: "2026-10-03T09:00:00Z", p_ran_by: "owner-1" })],
      isCleared: true,
    });
  });

  it("refuses to save a run whose batches are all in but hold the wrong number of results", async () => {
    // Arrange
    const [firstPart, secondPart] = getCompleteParts();
    const shortParts = [firstPart, { ...secondPart, results: [] }];
    jobs.fetchTestParts.mockResolvedValue({ isLoaded: true, data: shortParts });
    tableResults.set("chat_policy_tests", { data: OWNER_IDS.map((id) => ({ id, updated_at: "2026-10-03T09:00:00Z" })), error: null });

    // Act
    const result = await finishPolicyTestRunAction({ runKey: RUN_KEY });

    // Assert
    expect({ message: result.message, isSaved: rpc.mock.calls.length > 0 }).toEqual({ message: expect.stringContaining("The safety checks changed during this run."), isSaved: false });
  });

  it("refuses to save a run whose safety checks were tested before the checks changed", async () => {
    // Arrange
    jobs.fetchTestParts.mockResolvedValue({ isLoaded: true, data: getCompleteParts(null) });
    tableResults.set("chat_policy_tests", { data: OWNER_IDS.map((id) => ({ id, updated_at: "2026-10-03T09:00:00Z" })), error: null });

    // Act
    const result = await finishPolicyTestRunAction({ runKey: RUN_KEY });

    // Assert
    expect({ message: result.message, isSaved: rpc.mock.calls.length > 0 }).toEqual({ message: expect.stringContaining("The safety checks changed during this run."), isSaved: false });
  });
});

describe("runPolicyTestBatchAction when the safety checks changed mid-run", () => {
  it("refuses a batch when the run's batch count no longer matches its questions", async () => {
    // Arrange
    jobs.fetchTestJob.mockResolvedValue({ isLoaded: true, data: getJob({ batch_count: 1 }) });
    tableResults.set("chat_policy_tests", { data: getQuestionRows(OWNER_IDS), error: null });

    // Act
    const result = await runPolicyTestBatchAction({ runKey: RUN_KEY, batchIndex: 0 });

    // Assert
    expect({ message: result.message, isAsked: models.fetchTestResults.mock.calls.length > 0 }).toEqual({ message: expect.stringContaining("The safety checks changed during this run."), isAsked: false });
  });
});

describe("publishPolicyAction", () => {
  it("refuses a run saved before the current safety checks", async () => {
    // Arrange
    tableResults.set("chat_policy_test_runs", { data: { is_passed: true, results: getBuiltInResults() }, error: null });

    // Act
    const result = await publishPolicyAction(DRAFT_ID);

    // Assert
    expect({ message: result.message, isPublished: adminRpc.mock.calls.length > 0 }).toEqual({ message: expect.stringContaining("the safety checks were updated"), isPublished: false });
  });

  it("refuses a run where a built-in check got words the AI wrote", async () => {
    // Arrange
    const results = getBuiltInResults(SAFETY_CHECKS_VERSION).map((result, index) => (index === 2 ? { ...result, reply: "Lots of young families love the west side!", isApprovedWording: false } : result));
    tableResults.set("chat_policy_test_runs", { data: { is_passed: true, results }, error: null });

    // Act
    const result = await publishPolicyAction(DRAFT_ID);

    // Assert
    expect({ status: result.status, isPublished: adminRpc.mock.calls.length > 0 }).toEqual({ status: "error", isPublished: false });
  });

  it("publishes a draft whose run passed every current safety check with approved wording", async () => {
    // Arrange
    tableResults.set("chat_policy_test_runs", { data: { is_passed: true, results: getBuiltInResults(SAFETY_CHECKS_VERSION) }, error: null });

    // Act
    const result = await publishPolicyAction(DRAFT_ID);

    // Assert
    expect({ status: result.status, transition: adminRpc.mock.calls[0] }).toEqual({ status: "success", transition: ["transition", { p_workflow_key: "chat_policy_status", p_record_id: DRAFT_ID, p_to_state: "published" }] });
  });

  it("looks for a run with no question stamp when no question was ever saved", async () => {
    // Arrange
    vi.mocked(queries.fetchTestsChangedAt).mockResolvedValueOnce({ isLoaded: true, data: null });
    tableResults.set("chat_policy_test_runs", { data: { is_passed: true, results: getBuiltInResults(SAFETY_CHECKS_VERSION) }, error: null });

    // Act
    await publishPolicyAction(DRAFT_ID);

    // Assert
    expect(queryCalls.filter((call) => call.table === "chat_policy_test_runs" && call.method === "is")).toEqual([{ table: "chat_policy_test_runs", method: "is", args: ["tests_updated_at", null] }]);
  });
});

describe("publishPolicyAction and the newest run (bug 14)", () => {
  it("refuses when the newest run for this save failed, even after an earlier pass", async () => {
    // Arrange
    tableResults.set("chat_policy_test_runs", { data: { is_passed: false, results: getBuiltInResults(SAFETY_CHECKS_VERSION) }, error: null });

    // Act
    const result = await publishPolicyAction(DRAFT_ID);

    // Assert
    expect({ message: result.message, isPublished: adminRpc.mock.calls.length > 0 }).toEqual({ message: expect.stringContaining("Your latest test run had failures."), isPublished: false });
  });

  it("no longer filters the run lookup to passing runs", async () => {
    // Arrange
    tableResults.set("chat_policy_test_runs", { data: { is_passed: true, results: getBuiltInResults(SAFETY_CHECKS_VERSION) }, error: null });

    // Act
    await publishPolicyAction(DRAFT_ID);

    // Assert
    expect(queryCalls.some((call) => call.table === "chat_policy_test_runs" && call.method === "eq" && call.args[0] === "is_passed")).toBe(false);
  });
});

function getSaveForm(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries({ body: "# Office hours\nWeekdays.", ...fields })) formData.set(name, value);
  return formData;
}

const SAVED_ROW = { id: DRAFT_ID, version: 3, updated_at: "2026-10-05T12:00:00Z" };

describe("savePolicyDraftAction with the save guard (bug 12)", () => {
  it("saves over the draft when its stamp still matches", async () => {
    // Arrange
    tableQueues.set("chat_policies", [{ data: SAVED_ROW, error: null }]);

    // Act
    const state = await savePolicyDraftAction(IDLE_ACTION_STATE, getSaveForm({ draftId: DRAFT_ID, expectedUpdatedAt: DRAFT.updated_at }));

    // Assert
    expect({ status: state.status, isGuarded: queryCalls.some((call) => call.method === "eq" && call.args[0] === "updated_at" && call.args[1] === DRAFT.updated_at) }).toEqual({ status: "success", isGuarded: true });
  });

  it("refuses when the draft changed since the editor last saw it", async () => {
    // Arrange
    tableQueues.set("chat_policies", [{ data: null, error: null }, { data: { id: DRAFT_ID }, error: null }]);

    // Act
    const state = await savePolicyDraftAction(IDLE_ACTION_STATE, getSaveForm({ draftId: DRAFT_ID, expectedUpdatedAt: "2026-10-01T00:00:00Z" }));

    // Assert
    expect({ status: state.status, message: state.message }).toEqual({ status: "error", message: expect.stringContaining("This draft changed in another window or by a restore.") });
  });

  it("starts a new draft when the open one was published meanwhile", async () => {
    // Arrange
    tableQueues.set("chat_policies", [{ data: null, error: null }, { data: null, error: null }, { data: { ...SAVED_ROW, version: 4 }, error: null }]);

    // Act
    const state = await savePolicyDraftAction(IDLE_ACTION_STATE, getSaveForm({ draftId: DRAFT_ID, expectedUpdatedAt: DRAFT.updated_at }));

    // Assert
    expect(state.message).toBe("Saved as draft version 4. Run the tests before publishing.");
  });

  it("saves as before when no stamp is sent", async () => {
    // Arrange
    tableQueues.set("chat_policies", [{ data: SAVED_ROW, error: null }]);

    // Act
    const state = await savePolicyDraftAction(IDLE_ACTION_STATE, getSaveForm({ draftId: DRAFT_ID }));

    // Assert
    expect({ status: state.status, isGuarded: queryCalls.some((call) => call.method === "eq" && call.args[0] === "updated_at") }).toEqual({ status: "success", isGuarded: false });
  });
});

const SOURCE_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE = { id: SOURCE_ID, body: "# Office hours\nOld text.", version: 1 };

describe("restorePolicyVersionAction (bug 12)", () => {
  it("copies the version into the open draft and reports it for Undo", async () => {
    // Arrange
    tableQueues.set("chat_policies", [{ data: SOURCE, error: null }, { data: { id: DRAFT_ID, status: "draft" }, error: null }, { data: SAVED_ROW, error: null }]);

    // Act
    const result = await restorePolicyVersionAction(SOURCE_ID);

    // Assert
    expect(result).toEqual(expect.objectContaining({ status: "success", draftId: DRAFT_ID, updatedAt: SAVED_ROW.updated_at, didReplace: true, message: "Version 1 copied into your open draft (version 3). Run the tests again before publishing." }));
  });

  it("starts a new draft, with no Undo, when no draft is open", async () => {
    // Arrange
    tableQueues.set("chat_policies", [{ data: SOURCE, error: null }, { data: { id: "live", status: "published" }, error: null }, { data: { ...SAVED_ROW, version: 4 }, error: null }]);

    // Act
    const result = await restorePolicyVersionAction(SOURCE_ID);

    // Assert
    expect(result).toEqual(expect.objectContaining({ status: "success", didReplace: false, message: "Version 1 copied into new draft version 4. Test it, then publish." }));
  });

  it("reports no replacement when the open draft was published in another tab meanwhile", async () => {
    // Arrange
    tableQueues.set("chat_policies", [{ data: SOURCE, error: null }, { data: { id: DRAFT_ID, status: "draft" }, error: null }, { data: null, error: null }, { data: { ...SAVED_ROW, version: 4 }, error: null }]);

    // Act
    const result = await restorePolicyVersionAction(SOURCE_ID);

    // Assert
    expect(result).toEqual(expect.objectContaining({ status: "success", didReplace: false }));
  });

  it("won't restore the open draft onto itself", async () => {
    // Arrange
    tableQueues.set("chat_policies", [{ data: { ...SOURCE, id: DRAFT_ID }, error: null }, { data: { id: DRAFT_ID, status: "draft" }, error: null }]);

    // Act
    const result = await restorePolicyVersionAction(DRAFT_ID);

    // Assert
    expect(result.message).toContain("already your open draft");
  });
});
