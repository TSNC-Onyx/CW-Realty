import "server-only";

import { fetchAssistantReply, type AnswerModel } from "@/lib/chat/answer-question";
import { getFailedTestResult, getTestResult, type PolicyTestCase, type PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";
import { reportProblem } from "@/lib/observability/report-problem";

// Runs each test question through exactly the visitor pipeline, a few at a time so a long
// list finishes quickly without flooding the model provider.

const PARALLEL_TESTS = 4;

/** errorName: the model call's error class when the question got no reply. */
type TestOutcome = { result: PolicyTestResult; errorName: string | null };

async function fetchOneOutcome({ policyBody, testCase, model }: { policyBody: string; testCase: PolicyTestCase; model: AnswerModel }): Promise<TestOutcome> {
  try {
    const reply = await fetchAssistantReply({ policyBody, turns: [{ role: "visitor", body: testCase.question }], model });
    return { result: getTestResult(testCase, reply), errorName: null };
  } catch (error) {
    return { result: getFailedTestResult(testCase), errorName: error instanceof Error ? error.name : "unknown" };
  }
}

// One record per run, not per question, so a model outage doesn't flood the problem log.
async function reportModelFailures(outcomes: TestOutcome[]): Promise<void> {
  const errorNames = outcomes.flatMap((outcome) => (outcome.errorName ? [outcome.errorName] : []));
  if (errorNames.length === 0) return;
  await reportProblem({
    action: "chat_policy.run_tests",
    stage: "external",
    severity: "error",
    code: errorNames[0],
    detail: `${errorNames.length} of ${outcomes.length} test questions got no reply from the model`,
  });
}

export async function fetchTestResults({ policyBody, testCases, model }: { policyBody: string; testCases: PolicyTestCase[]; model: AnswerModel }): Promise<PolicyTestResult[]> {
  const outcomes: TestOutcome[] = [];
  for (let start = 0; start < testCases.length; start += PARALLEL_TESTS) {
    const batch = testCases.slice(start, start + PARALLEL_TESTS);
    outcomes.push(...(await Promise.all(batch.map((testCase) => fetchOneOutcome({ policyBody, testCase, model })))));
  }
  await reportModelFailures(outcomes);
  return outcomes.map((outcome) => outcome.result);
}
