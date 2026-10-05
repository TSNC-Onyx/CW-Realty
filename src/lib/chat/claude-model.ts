import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import type { AnswerModel, ChatTurn } from "@/lib/chat/answer-question";
import { modelReplySchema, type ModelReply } from "@/lib/chat/assistant-reply";

// Claude, called from the server only (Phase 5 plan, decision 1). The API key is a Worker
// secret; without it the assistant is simply "not ready" and chat hands off to a person.
// Changing the model, effort or any request setting below? Bump SAFETY_CHECKS_VERSION in
// test-verdict.ts so every policy is re-tested before it can publish again
// (assistant-fingerprint.test.ts fails until you do).

// Owner chose Haiku 4.5 for cost (2026-10-04). Haiku 4.5 takes no adaptive thinking, effort,
// or server-side fallbacks; a refusal still ends as a handoff through getNoAnswerReason.
export const CHAT_MODEL = "claude-haiku-4-5";
export const MAX_REPLY_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;
const UNREADABLE_REPLY = "unreadable";

/** Why Claude gave no usable answer: its stop reason (for example "refusal" or "max_tokens"), or "unreadable". */
export type NoAnswerReason = string;

type ClaudeRequest = { systemPrompt: string; turns: ChatTurn[] };

type ClaudeModelOptions = { onNoAnswer?: (reason: NoAnswerReason) => Promise<void> };

function getMessages(turns: ChatTurn[]): Anthropic.Beta.BetaMessageParam[] {
  const firstVisitorIndex = turns.findIndex((turn) => turn.role === "visitor");
  return turns.slice(Math.max(firstVisitorIndex, 0)).map((turn) => ({ role: turn.role === "visitor" ? "user" : "assistant", content: turn.body }));
}

function getNoAnswerReason({ stopReason, parsedOutput }: { stopReason: string | null; parsedOutput: ModelReply | null }): NoAnswerReason | null {
  if (stopReason !== "end_turn") return stopReason ?? UNREADABLE_REPLY;
  return parsedOutput ? null : UNREADABLE_REPLY;
}

async function fetchClaudeReply({ client, request, onNoAnswer }: { client: Anthropic; request: ClaudeRequest } & ClaudeModelOptions): Promise<ModelReply | null> {
  const { systemPrompt, turns } = request;
  const response = await client.beta.messages.parse({
    model: CHAT_MODEL,
    max_tokens: MAX_REPLY_TOKENS,
    output_config: { format: betaZodOutputFormat(modelReplySchema) },
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: getMessages(turns),
  });
  const noAnswerReason = getNoAnswerReason({ stopReason: response.stop_reason, parsedOutput: response.parsed_output });
  if (noAnswerReason === null) return response.parsed_output;
  await onNoAnswer?.(noAnswerReason);
  return null;
}

export function isAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Null when no API key is set (local, CI, or before launch). onNoAnswer hears why a reply was unusable. */
export function getClaudeAnswerModel({ onNoAnswer }: ClaudeModelOptions = {}): AnswerModel | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
  return (request) => fetchClaudeReply({ client, request, onNoAnswer });
}
