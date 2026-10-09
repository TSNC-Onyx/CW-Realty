import "server-only";

import { fetchAssistantReply, type AnswerModel } from "@/lib/chat/answer-question";
import { getFailedTestResult, getTestResult, type PolicyTestCase, type PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";
import { reportProblem } from "@/lib/observability/report-problem";

// Runs each test question through exactly the visitor pipeline, a few at a time so a long
// list finishes quickly without flooding the model provider. AI replies vary from run to run,
// so an owner question that fails is asked once more: passing then marks it "unstable"
// (pass@2). Built-in safety checks get one try and must pass it; a failed one is reported to
// the developer, since the owner can't fix it from the policy
// (docs/cwr-chat-quick-answers-and-tests-plan.md §D, §E).

const PARALLEL_TESTS = 4;

/** errorName: the model call's error class when the question got no reply. */
type TestOutcome = { result: PolicyTestResult; errorName: string | null };

type TestAttempt = { policyBody: string; testCase: PolicyTestCase; model: AnswerModel };

async function fetchAttemptOutcome({ policyBody, testCase, model }: TestAttempt): Promise<TestOutcome> {
  try {
    const reply = await fetchAssistantReply({ policyBody, turns: [{ role: "visitor", body: testCase.question }], model });
    return { result: getTestResult(testCase, reply), errorName: null };
  } catch (error) {
    return { result: getFailedTestResult(testCase), errorName: error instanceof Error ? error.name : "unknown" };
  }
}

/** A second-try pass is unstable only when the first try got a reply; a first try's model error is still reported. */
async function fetchOneOutcome(attempt: TestAttempt): Promise<TestOutcome> {
  const first = await fetchAttemptOutcome(attempt);
  if (first.result.isPassed || attempt.testCase.isBuiltIn) return first;
  const second = await fetchAttemptOutcome(attempt);
  const isUnstable = second.result.isPassed && first.errorName === null;
  return { result: isUnstable ? { ...second.result, isUnstable } : second.result, errorName: second.errorName ?? first.errorName };
}

type TestRunInput = { policyBody: string; testCases: PolicyTestCase[]; model: AnswerModel; batchLabel: string };

// One record per batch, not per question, so a model outage doesn't flood the problem log.
async function reportModelFailures({ outcomes, batchLabel }: { outcomes: TestOutcome[]; batchLabel: string }): Promise<void> {
  const errorNames = outcomes.flatMap((outcome) => (outcome.errorName ? [outcome.errorName] : []));
  if (errorNames.length === 0) return;
  await reportProblem({
    action: "chat_policy.run_tests",
    stage: "external",
    severity: "error",
    code: errorNames[0],
    detail: `${errorNames.length} of ${outcomes.length} test questions got no reply from the model (${batchLabel})`,
  });
}

// One record per batch: a failed safety check needs the developer, whatever the policy says.
async function reportSafetyFailures({ outcomes, batchLabel }: { outcomes: TestOutcome[]; batchLabel: string }): Promise<void> {
  const failedQuestions = outcomes.filter((outcome) => outcome.result.isBuiltIn && !outcome.result.isPassed && outcome.errorName === null).map((outcome) => outcome.result.question);
  if (failedQuestions.length === 0) return;
  await reportProblem({
    action: "chat_policy.run_tests",
    stage: "rule",
    severity: "error",
    code: "safety_check_failed",
    detail: `${failedQuestions.length} built-in safety check(s) failed (${batchLabel}): ${failedQuestions.join(" | ")}`,
  });
}

/** batchLabel: which batch of the run this is ("batch 2 of 6"), for the problem log. */
export async function fetchTestResults({ policyBody, testCases, model, batchLabel }: TestRunInput): Promise<PolicyTestResult[]> {
  const outcomes: TestOutcome[] = [];
  for (let start = 0; start < testCases.length; start += PARALLEL_TESTS) {
    const batch = testCases.slice(start, start + PARALLEL_TESTS);
    outcomes.push(...(await Promise.all(batch.map((testCase) => fetchOneOutcome({ policyBody, testCase, model })))));
  }
  await reportModelFailures({ outcomes, batchLabel });
  await reportSafetyFailures({ outcomes, batchLabel });
  return outcomes.map((outcome) => outcome.result);
}
