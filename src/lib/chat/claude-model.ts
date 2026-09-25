import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import type { AnswerModel, ChatTurn } from "@/lib/chat/answer-question";
import { modelReplySchema, type ModelReply } from "@/lib/chat/assistant-reply";

// Claude, called from the server only (Phase 5 plan, decision 1). The API key is a Worker
// secret; without it the assistant is simply "not ready" and chat hands off to a person.

const CHAT_MODEL = "claude-opus-5";
// Short policy answers: low effort keeps replies quick without changing the model.
const CHAT_EFFORT = "low";
const MAX_REPLY_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;
// If Claude declines a request, the API retries it on its recommended fallback model.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function getMessages(turns: ChatTurn[]): Anthropic.Beta.BetaMessageParam[] {
  const firstVisitorIndex = turns.findIndex((turn) => turn.role === "visitor");
  return turns.slice(Math.max(firstVisitorIndex, 0)).map((turn) => ({ role: turn.role === "visitor" ? "user" : "assistant", content: turn.body }));
}

async function fetchClaudeReply(client: Anthropic, { systemPrompt, turns }: { systemPrompt: string; turns: ChatTurn[] }): Promise<ModelReply | null> {
  const response = await client.beta.messages.parse({
    model: CHAT_MODEL,
    max_tokens: MAX_REPLY_TOKENS,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: CHAT_EFFORT, format: betaZodOutputFormat(modelReplySchema) },
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: getMessages(turns),
  });
  if (response.stop_reason !== "end_turn") return null;
  return response.parsed_output ?? null;
}

export function isAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Null when no API key is set (local, CI, or before launch). */
export function getClaudeAnswerModel(): AnswerModel | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
  return (request) => fetchClaudeReply(client, request);
}
