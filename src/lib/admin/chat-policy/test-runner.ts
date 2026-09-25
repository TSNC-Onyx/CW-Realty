import "server-only";

import { fetchAssistantReply, type AnswerModel } from "@/lib/chat/answer-question";
import { getFailedTestResult, getTestResult, type PolicyTestCase, type PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";

// Runs each test question through exactly the visitor pipeline, a few at a time so a long
// list finishes quickly without flooding the model provider.

const PARALLEL_TESTS = 4;

async function fetchOneResult({ policyBody, testCase, model }: { policyBody: string; testCase: PolicyTestCase; model: AnswerModel }): Promise<PolicyTestResult> {
  try {
    const reply = await fetchAssistantReply({ policyBody, turns: [{ role: "visitor", body: testCase.question }], model });
    return getTestResult(testCase, reply);
  } catch (error) {
    console.error(JSON.stringify({ message: "Policy test question failed", error: error instanceof Error ? error.name : "unknown" }));
    return getFailedTestResult(testCase);
  }
}

export async function fetchTestResults({ policyBody, testCases, model }: { policyBody: string; testCases: PolicyTestCase[]; model: AnswerModel }): Promise<PolicyTestResult[]> {
  const results: PolicyTestResult[] = [];
  for (let start = 0; start < testCases.length; start += PARALLEL_TESTS) {
    const batch = testCases.slice(start, start + PARALLEL_TESTS);
    results.push(...(await Promise.all(batch.map((testCase) => fetchOneResult({ policyBody, testCase, model })))));
  }
  return results;
}
