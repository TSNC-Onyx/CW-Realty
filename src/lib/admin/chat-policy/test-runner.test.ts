import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchTestResults } from "@/lib/admin/chat-policy/test-runner";
import { BUILT_IN_TEST_CASES, type PolicyTestCase } from "@/lib/admin/chat-policy/test-verdict";
import * as answerQuestion from "@/lib/chat/answer-question";
import { HANDOFF_TEXT } from "@/lib/chat/handoff-text";
import * as reporting from "@/lib/observability/report-problem";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/chat/answer-question", () => ({ fetchAssistantReply: vi.fn() }));
vi.mock("@/lib/observability/report-problem", () => ({ reportProblem: vi.fn() }));

const OWNER_CASE: PolicyTestCase = { question: "When are you open?", expectedOutcome: "answer", expectedSection: "Office hours", isBuiltIn: false, allowsFriendlyReply: false, mustMention: [] };
const RIGHT_ANSWER = { outcome: "answer" as const, text: "Weekdays.", citedSections: ["Office hours"] };
const WRONG_ANSWER = { outcome: "handoff" as const, text: HANDOFF_TEXT.needsPerson, citedSections: [] };
const RUN = { policyBody: "# Office hours\nWeekdays.", model: vi.fn(), batchLabel: "batch 1 of 1" };

describe("fetchTestResults", () => {
  beforeEach(() => {
    vi.mocked(answerQuestion.fetchAssistantReply).mockReset();
    vi.mocked(reporting.reportProblem).mockReset();
  });

  it("asks a failed owner question once more and marks a second-try pass as unstable", async () => {
    // Arrange
    vi.mocked(answerQuestion.fetchAssistantReply).mockResolvedValueOnce(WRONG_ANSWER).mockResolvedValueOnce(RIGHT_ANSWER);

    // Act
    const [result] = await fetchTestResults({ ...RUN, testCases: [OWNER_CASE] });

    // Assert
    expect({ isPassed: result?.isPassed, isUnstable: result?.isUnstable, asks: vi.mocked(answerQuestion.fetchAssistantReply).mock.calls.length }).toEqual({ isPassed: true, isUnstable: true, asks: 2 });
  });

  it("asks a passing question only once", async () => {
    // Arrange
    vi.mocked(answerQuestion.fetchAssistantReply).mockResolvedValue(RIGHT_ANSWER);

    // Act
    const [result] = await fetchTestResults({ ...RUN, testCases: [OWNER_CASE] });

    // Assert
    expect({ isUnstable: result?.isUnstable, asks: vi.mocked(answerQuestion.fetchAssistantReply).mock.calls.length }).toEqual({ isUnstable: undefined, asks: 1 });
  });

  it("gives a built-in safety check one try, and reports its failure to the developer", async () => {
    // Arrange
    vi.mocked(answerQuestion.fetchAssistantReply).mockResolvedValue({ outcome: "handoff", text: "I'd rather not say!", citedSections: [] });
    const builtIn = BUILT_IN_TEST_CASES[0] as PolicyTestCase;

    // Act
    const [result] = await fetchTestResults({ ...RUN, testCases: [builtIn] });

    // Assert
    expect({ isPassed: result?.isPassed, asks: vi.mocked(answerQuestion.fetchAssistantReply).mock.calls.length, reported: vi.mocked(reporting.reportProblem).mock.calls[0]?.[0] }).toEqual({ isPassed: false, asks: 1, reported: expect.objectContaining({ action: "chat_policy.run_tests", code: "safety_check_failed" }) });
  });

  it("doesn't call a question unstable when its first try got no reply", async () => {
    // Arrange
    vi.mocked(answerQuestion.fetchAssistantReply).mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(RIGHT_ANSWER);

    // Act
    const [result] = await fetchTestResults({ ...RUN, testCases: [OWNER_CASE] });

    // Assert
    expect({ isPassed: result?.isPassed, isUnstable: result?.isUnstable, reported: vi.mocked(reporting.reportProblem).mock.calls[0]?.[0].code }).toEqual({ isPassed: true, isUnstable: undefined, reported: "TypeError" });
  });
});

