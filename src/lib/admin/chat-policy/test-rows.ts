import { BUILT_IN_TEST_CASES, type PolicyTestCase, type PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";

// One list of test questions, each with its last result (docs/cwr-chat-policy-test-batches-plan.md,
// Part C). Display only: whether Publish is allowed is decided by the server's rule
// (isReadyToPublish), never by these rows. Safe in the browser: imports nothing server-only.

/** The page and every test run see the same questions, well under the API's 1000-row cap. */
export const MAX_TESTS = 500;

export const TEST_LIMIT_MESSAGE = `You can have up to ${MAX_TESTS} test questions. Remove one first.`;

/** Publish waits on a failed safety check, which the owner can't fix from the policy. */
export const SAFETY_FAILED_REASON = "A built-in safety check failed. Your developer has been notified automatically; no action is needed from you.";

/** Why tests, Publish, Restore and Undo wait while the editor holds unsaved text (bug 11). */
export const SAVE_FIRST_REASON = "Save your changes first, so the tests check what you see.";

const STATUS_ORDER = ["failed", "untested", "stale", "passed"] as const;

export type TestRowStatus = (typeof STATUS_ORDER)[number];

export type OwnerTest = { id: string; question: string; expectedOutcome: PolicyTestCase["expectedOutcome"]; expectedSection: string | null; allowsFriendlyReply: boolean; mustMention: string[] };

/** testId: null for a built-in safety check, which can't be removed. */
export type TestRow = PolicyTestCase & { key: string; testId: string | null; status: TestRowStatus; result: PolicyTestResult | null };

export type TestCounts = Record<TestRowStatus | "all", number>;

type RowCase = PolicyTestCase & { key: string; testId: string | null };

export type PublishBlockerInput = {
  isReadyToPublish: boolean;
  isRunning: boolean;
  /** The editor holds text that isn't saved: tests and Publish would use the saved text instead. */
  hasUnsavedChanges: boolean;
  hasDraft: boolean;
  didRunLoad: boolean;
  isAssistantConfigured: boolean;
  hasRun: boolean;
  isCurrent: boolean;
  /** Every current built-in safety check was tested under the current version (pass or fail). */
  hasCurrentChecksVersion: boolean;
  counts: TestCounts;
  /** Failed built-in safety checks: only the developer can fix these. */
  safetyFailedCount: number;
};

function getRowCases(tests: OwnerTest[]): RowCase[] {
  const ownerCases = tests.map((test) => ({ ...test, isBuiltIn: false, key: test.id, testId: test.id }));
  const builtInCases = BUILT_IN_TEST_CASES.map((testCase, index) => ({ ...testCase, key: `built-in-${index}`, testId: null }));
  return [...ownerCases, ...builtInCases];
}

/** Runs saved before the optional checks existed tested them as off. */
function hasSameChecks(testCase: PolicyTestCase, result: PolicyTestResult): boolean {
  const isSameFriendly = (result.allowsFriendlyReply ?? false) === testCase.allowsFriendlyReply;
  return isSameFriendly && JSON.stringify(result.mustMention ?? []) === JSON.stringify(testCase.mustMention);
}

function isSameCase(testCase: PolicyTestCase, result: PolicyTestResult): boolean {
  const isSameQuestion = result.question === testCase.question && result.isBuiltIn === testCase.isBuiltIn;
  return isSameQuestion && result.expectedOutcome === testCase.expectedOutcome && result.expectedSection === testCase.expectedSection && hasSameChecks(testCase, result);
}

/** Each result is used once, so two identical questions never share one result. */
function getMatchedResults({ rowCases, results }: { rowCases: RowCase[]; results: PolicyTestResult[] }): (PolicyTestResult | null)[] {
  const unusedResults = [...results];
  return rowCases.map((rowCase) => {
    const index = unusedResults.findIndex((result) => isSameCase(rowCase, result));
    return index === -1 ? null : (unusedResults.splice(index, 1)[0] ?? null);
  });
}

function getRowStatus({ result, isCurrent }: { result: PolicyTestResult | null; isCurrent: boolean }): TestRowStatus {
  if (!result) return "untested";
  if (!isCurrent) return "stale";
  return result.isPassed ? "passed" : "failed";
}

function compareRows(first: TestRow, second: TestRow): number {
  return STATUS_ORDER.indexOf(first.status) - STATUS_ORDER.indexOf(second.status) || Number(first.isBuiltIn) - Number(second.isBuiltIn);
}

/** Failed first, then not tested, then out of date, then passed; built-in checks last in each group. */
export function getTestRows({ tests, results, isCurrent }: { tests: OwnerTest[]; results: PolicyTestResult[]; isCurrent: boolean }): TestRow[] {
  const rowCases = getRowCases(tests);
  const matchedResults = getMatchedResults({ rowCases, results });
  const rows = rowCases.map((rowCase, index) => {
    const result = matchedResults[index] ?? null;
    return { ...rowCase, result, status: getRowStatus({ result, isCurrent }) };
  });
  return rows.sort(compareRows);
}

export function getTestCounts(rows: TestRow[]): TestCounts {
  const counts: TestCounts = { all: rows.length, failed: 0, untested: 0, stale: 0, passed: 0 };
  return rows.reduce((total, row) => ({ ...total, [row.status]: total[row.status] + 1 }), counts);
}

/** The results summary (docs/cwr-chat-quick-answers-and-tests-plan.md §F): who needs to act. */
/** noReply: failures with no reply (a connection problem): running again is the fix, not the owner's edits. */
export type AttentionCounts = { needsYou: number; developerNotified: number; noReply: number; passed: number; unstable: number };

export function getAttentionCounts(rows: TestRow[]): AttentionCounts {
  const failedRows = rows.filter((row) => row.status === "failed");
  const passedRows = rows.filter((row) => row.status === "passed");
  const developerNotified = failedRows.filter((row) => row.isBuiltIn).length;
  const noReply = failedRows.filter((row) => !row.isBuiltIn && row.result?.outcome === null).length;
  return { needsYou: failedRows.length - developerNotified - noReply, developerNotified, noReply, passed: passedRows.length, unstable: passedRows.filter((row) => row.result?.isUnstable).length };
}

/** Sections no owner question expects, so the owner can see what isn't tested yet. */
export function getUncoveredSections({ sections, tests }: { sections: string[]; tests: OwnerTest[] }): string[] {
  const coveredTitles = new Set(tests.flatMap((test) => (test.expectedSection ? [test.expectedSection.trim().toLowerCase()] : [])));
  return sections.filter((section) => !coveredTitles.has(section.trim().toLowerCase()));
}

export function getQuestionCountText(count: number): string {
  return count === 1 ? "1 question" : `${count} questions`;
}

function getUntestedBlocker(counts: TestCounts): string | null {
  if (counts.untested === 0) return null;
  const verb = counts.untested === 1 ? "isn't" : "aren't";
  return `${getQuestionCountText(counts.untested)} ${verb} tested yet. Run the tests again.`;
}

function getFailedBlocker({ counts, safetyFailedCount }: { counts: TestCounts; safetyFailedCount: number }): string | null {
  if (counts.failed === 0) return null;
  if (safetyFailedCount === counts.failed) return SAFETY_FAILED_REASON;
  const ownerFailedCount = counts.failed - safetyFailedCount;
  const safetyNote = safetyFailedCount > 0 ? " A safety check also failed; your developer has been notified." : "";
  return `${getQuestionCountText(ownerFailedCount)} ${ownerFailedCount === 1 ? "needs" : "need"} your attention. Use the fixes beside each one, then run the tests again.${safetyNote}`;
}

function getSetupBlocker(input: PublishBlockerInput): string | null {
  if (!input.hasDraft) return "Save a draft first.";
  if (!input.didRunLoad) return "The last test run didn't load. Refresh the page.";
  if (!input.isAssistantConfigured) return "The chat assistant isn't connected yet, so the tests can't run.";
  return null;
}

function getRunBlocker(input: PublishBlockerInput): string | null {
  if (!input.hasRun) return "Run the tests first.";
  if (!input.isCurrent) return "You changed the draft or questions since the last run. Run the tests again.";
  // Before failed and untested: an old run's new safety checks show as untested, and this says why.
  if (!input.hasCurrentChecksVersion) return "The safety checks were updated. Run the tests again.";
  return null;
}

/**
 * Why Publish is locked, in plain words. It follows the button (the server's rule, and a run in
 * progress), so it never says "nothing is wrong" while Publish is greyed, or names a problem
 * while it is enabled.
 */
/** A version's status with the date that matters for it (bug 14): published for live versions, last saved for drafts. */
export function getHistoryWhenLabel({ status, isWorkingDraft, savedText, publishedText }: { status: "draft" | "published" | "archived"; isWorkingDraft: boolean; savedText: string; publishedText: string }): string {
  if (status === "published") return `Live now · published ${publishedText}`;
  if (status === "archived") return `Earlier live version · published ${publishedText}`;
  return `${isWorkingDraft ? "Draft" : "Unused draft"} · last saved ${savedText}`;
}

export type RestoreState = { isShown: boolean; isDisabled: boolean };

/**
 * A version's Restore button (bugs 11–12, docs/cwr-chatbot-round-3-plan.md): never on the open
 * draft itself, and not while unsaved edits or a test run could be overwritten.
 */
export function getRestoreState({ hasUnsavedChanges, isRunning, isWorkingDraft }: { hasUnsavedChanges: boolean; isRunning: boolean; isWorkingDraft: boolean }): RestoreState {
  return { isShown: !isWorkingDraft, isDisabled: hasUnsavedChanges || isRunning };
}

export function getPublishBlocker(input: PublishBlockerInput): string | null {
  if (input.isRunning) return "Tests are running…";
  if (input.hasUnsavedChanges) return SAVE_FIRST_REASON;
  if (input.isReadyToPublish) return null;
  return getSetupBlocker(input) ?? getRunBlocker(input) ?? getFailedBlocker(input) ?? getUntestedBlocker(input.counts) ?? "Run the tests again to check the current questions.";
}

export function isAtTestLimit(activeCount: number): boolean {
  return activeCount >= MAX_TESTS;
}
