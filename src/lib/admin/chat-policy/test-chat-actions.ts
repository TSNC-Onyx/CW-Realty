"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { policyBodySchema } from "@/lib/admin/chat-policy/policy-schema";
import { AdminAccessError, OWNER_ROLES, requireAdmin } from "@/lib/admin/require-admin";
import { fetchAssistantReply } from "@/lib/chat/answer-question";
import type { AssistantReply } from "@/lib/chat/assistant-reply";
import { MAX_CHAT_MESSAGE_LENGTH, MAX_VISITOR_MESSAGES_PER_CHAT } from "@/lib/chat/chat-schemas";
import { getClaudeAnswerModel } from "@/lib/chat/claude-model";

// Live test chat in the policy editor (Admin §6): the owner chats with the assistant using the
// text in the editor, saved or not. Nothing is logged; visitors never see these replies.

const testChatSchema = z.object({
  policyBody: policyBodySchema,
  turns: z.array(z.object({ role: z.enum(["visitor", "assistant"]), body: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_LENGTH * 2) })).min(1).max(MAX_VISITOR_MESSAGES_PER_CHAT * 2),
});

export type TestChatInput = z.input<typeof testChatSchema>;

export type TestChatResult = { status: "replied"; reply: AssistantReply } | { status: "error"; message: string };

async function fetchTestReply(input: TestChatInput): Promise<TestChatResult> {
  await requireAdmin(OWNER_ROLES);
  const parsed = testChatSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the policy text and your question." };
  const model = getClaudeAnswerModel();
  if (!model) return { status: "error", message: "The chat assistant isn't connected yet (no Anthropic API key). The site owner adds the key at launch." };
  return { status: "replied", reply: await fetchAssistantReply({ policyBody: parsed.data.policyBody, turns: parsed.data.turns, model }) };
}

export async function sendTestChatAction(input: TestChatInput): Promise<TestChatResult> {
  try {
    return await fetchTestReply(input);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AdminAccessError) return { status: "error", message: error.message };
    console.error(JSON.stringify({ message: "Test chat failed", error: error instanceof Error ? error.name : "unknown" }));
    return { status: "error", message: "The assistant didn't reply. Try again in a moment." };
  }
}
