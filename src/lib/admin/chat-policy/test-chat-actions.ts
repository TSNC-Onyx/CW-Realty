"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { policyBodySchema } from "@/lib/admin/chat-policy/policy-schema";
import { AdminAccessError, OWNER_ROLES, requireAdmin } from "@/lib/admin/require-admin";
import { fetchAssistantReply, getRepairedTurnReply, type AnswerRequest } from "@/lib/chat/answer-question";
import { getReplyWithoutRejectedText, type AssistantReply } from "@/lib/chat/assistant-reply";
import { MAX_CHAT_MESSAGE_LENGTH, MAX_VISITOR_MESSAGES_PER_CHAT } from "@/lib/chat/chat-schemas";
import { getClaudeAnswerModel } from "@/lib/chat/claude-model";
import { runInActionContext } from "@/lib/observability/action-context";
import { isReferenceWorthy, type ProblemSeverity, type ProblemStage } from "@/lib/observability/problem-types";
import { getReferenceSuffix } from "@/lib/observability/reference";
import { reportProblem } from "@/lib/observability/report-problem";
import { ReportedProblemError } from "@/lib/observability/reported-problem-error";

// Live test chat in the policy editor (Admin §6): the owner chats with the assistant using the
// text in the editor, saved or not. Nothing is logged; visitors never see these replies.
// Not run through runQuickAction (it returns a reply, not a result), so every error it
// returns is recorded here (docs/cwr-error-tracking-plan.md).

const TEST_CHAT_ACTION = "chat_policy.test_chat";
const NO_MODEL_MESSAGE = "The chat assistant isn't connected yet (no Anthropic API key). The site owner adds the key at launch.";
const NO_REPLY_MESSAGE = "The assistant didn't reply. Try again in a moment.";

const testChatSchema = z.object({
  policyBody: policyBodySchema,
  turns: z.array(z.object({ role: z.enum(["visitor", "assistant"]), body: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_LENGTH * 2) })).min(1).max(MAX_VISITOR_MESSAGES_PER_CHAT * 2),
});

export type TestChatInput = z.input<typeof testChatSchema>;

export type TestChatResult = { status: "replied"; reply: AssistantReply } | { status: "error"; message: string };

type TestChatProblem = { stage: ProblemStage; severity: ProblemSeverity; code: string; message: string };

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "NonError";
}

async function reportTestChatError({ stage, severity, code, message }: TestChatProblem): Promise<TestChatResult> {
  const result = await reportProblem({ action: TEST_CHAT_ACTION, stage, severity, code, shownMessage: message });
  const suffix = isReferenceWorthy(severity) ? getReferenceSuffix({ reference: result.reference, isStored: result.stored === true }) : "";
  return { status: "error", message: `${message}${suffix}` };
}

// Boundary around the model provider: only the error's class is kept, never its text.
async function fetchModelReply(request: AnswerRequest): Promise<TestChatResult> {
  try {
    const reply = getReplyWithoutRejectedText(await fetchAssistantReply(request));
    return { status: "replied", reply: getRepairedTurnReply({ reply, turns: request.turns }) };
  } catch (error) {
    return reportTestChatError({ stage: "external", severity: "error", code: getErrorName(error), message: NO_REPLY_MESSAGE });
  }
}

async function fetchTestReply(input: TestChatInput): Promise<TestChatResult> {
  await requireAdmin(OWNER_ROLES);
  const parsed = testChatSchema.safeParse(input);
  if (!parsed.success) return reportTestChatError({ stage: "validate", severity: "info", code: "fields", message: parsed.error.issues[0]?.message ?? "Check the policy text and your question." });
  const model = getClaudeAnswerModel();
  if (!model) return reportTestChatError({ stage: "setup", severity: "warning", code: "no_api_key", message: NO_MODEL_MESSAGE });
  return fetchModelReply({ policyBody: parsed.data.policyBody, turns: parsed.data.turns, model });
}

async function reportFailedTestChat(error: unknown): Promise<TestChatResult> {
  if (error instanceof ReportedProblemError) return { status: "error", message: error.message };
  if (error instanceof AdminAccessError) return reportTestChatError({ stage: "access", severity: "warning", code: "wrong_role", message: error.message });
  return reportTestChatError({ stage: "unexpected", severity: "error", code: getErrorName(error), message: NO_REPLY_MESSAGE });
}

export async function sendTestChatAction(input: TestChatInput): Promise<TestChatResult> {
  return runInActionContext(TEST_CHAT_ACTION, async () => {
    try {
      return await fetchTestReply(input);
    } catch (error) {
      unstable_rethrow(error);
      return reportFailedTestChat(error);
    }
  });
}
