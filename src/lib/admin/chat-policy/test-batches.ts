import { BUILT_IN_TEST_CASES, type PolicyTestCase, type PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";
import type { QuickResult } from "@/lib/admin/quick-result";

// A test run in batches (docs/cwr-chat-policy-test-batches-plan.md, Part A): the run's
// question list is fixed when it starts, and each request tests one batch of it, so no
// request goes past the Cloudflare Workers Free limit of 50 outside calls.

/** 8 questions × (1 answer + 1 retry) = 16 model calls, keeping a batch request at 27 calls or fewer. */
export const BATCH_SIZE = 8;

/** One place in the run's list: a built-in safety check, or an owner question by id. */
export type TestSlot = { kind: "built_in"; testCase: PolicyTestCase } | { kind: "owner"; testId: string };

export type TestPart = { batchIndex: number; results: PolicyTestResult[] };

/** What starting a run returns: its key, and how many requests and questions it takes. */
export type TestRunStart = QuickResult & { runKey: string; batchCount: number; total: number };

export type TestBatchProgress = QuickResult & { done: number; total: number };

type OwnerTestStamp = { id: string; updated_at: string };

/** The order a run asks owner questions in: newest change first, then by id, so it never shifts mid-run. */
export function getOrderedTestIds(tests: OwnerTestStamp[]): string[] {
  return [...tests].sort((first, second) => second.updated_at.localeCompare(first.updated_at) || first.id.localeCompare(second.id)).map((test) => test.id);
}

export function getRunTotal(testIds: string[]): number {
  return BUILT_IN_TEST_CASES.length + testIds.length;
}

export function getBatchCount(testIds: string[]): number {
  return Math.ceil(getRunTotal(testIds) / BATCH_SIZE);
}

/** Built-in checks come first, then the owner questions, in the run's fixed order. */
export function getBatchSlots({ testIds, batchIndex }: { testIds: string[]; batchIndex: number }): TestSlot[] {
  const slots: TestSlot[] = [...BUILT_IN_TEST_CASES.map((testCase) => ({ kind: "built_in" as const, testCase })), ...testIds.map((testId) => ({ kind: "owner" as const, testId }))];
  return slots.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
}

/** Questions tested once this batch is done, for the progress line. */
export function getDoneCount({ testIds, batchIndex }: { testIds: string[]; batchIndex: number }): number {
  return Math.min((batchIndex + 1) * BATCH_SIZE, getRunTotal(testIds));
}

/** Every batch's results in order, or null when a batch is missing or repeated. */
export function getAssembledResults({ parts, batchCount }: { parts: TestPart[]; batchCount: number }): PolicyTestResult[] | null {
  const batchIndexes = parts.map((part) => part.batchIndex);
  const isComplete = parts.length === batchCount && new Set(batchIndexes).size === batchCount && batchIndexes.every((index) => index >= 0 && index < batchCount);
  if (!isComplete) return null;
  return [...parts].sort((first, second) => first.batchIndex - second.batchIndex).flatMap((part) => part.results);
}

/** True when the questions now active are exactly the ones the run started with. */
export function isSameQuestionSet({ runTestIds, currentTestIds }: { runTestIds: string[]; currentTestIds: string[] }): boolean {
  const currentIds = new Set(currentTestIds);
  return runTestIds.length === currentIds.size && runTestIds.every((testId) => currentIds.has(testId));
}
