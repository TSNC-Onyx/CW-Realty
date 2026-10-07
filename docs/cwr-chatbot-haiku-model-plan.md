# Chatbot model: Claude Haiku 4.5 — plan

Owner decision 2026-10-04: the public chatbot uses Claude Haiku 4.5 instead of Claude Opus 5, to cut cost.

## Goal

The chatbot's Claude call goes to `claude-haiku-4-5`, and its request settings are ones that model accepts.

## Architecture context

The website calls Claude from one place only, `src/lib/chat/claude-model.ts` → `fetchClaudeReply`. The visitor chat (`send-chat-message.ts`) and the admin test chat (`admin/chat-policy/*`) both use it through `getClaudeAnswerModel`.

## Scope

In scope: the model ID and the request settings in `claude-model.ts`, plus the model row in the Phase 5 plan.

Out of scope: prompt text, the reply schema, failure handling, rate limits, the chat-policy tests themselves, and prod deploy.

## Task breakdown

1. `src/lib/chat/claude-model.ts`
   - `CHAT_MODEL` → `"claude-haiku-4-5"`.
   - Remove `thinking: { type: "adaptive" }`. Haiku 4.5 doesn't support adaptive thinking, and without the field it runs with no thinking.
   - Remove `output_config.effort` and `CHAT_EFFORT`. Haiku 4.5 returns an error when effort is set.
   - Remove `betas: [FALLBACK_BETA]`, `fallbacks: "default"` and `FALLBACK_BETA`. Server-side fallbacks are documented for the Opus 5 and Fable safety classifiers only. A refusal still stops with `stop_reason: "refusal"`, and the existing `getNoAnswerReason` path already turns that into a handoff.
   - Keep `client.beta.messages.parse` and `betaZodOutputFormat`. Haiku 4.5 supports structured outputs.
2. `docs/cwr-phase-5-chatbot-plan.md` decision 1: record the model change.
3. Verify with typecheck, lint and the unit tests.

## Assumptions

- Haiku 4.5 supports structured outputs (claude-api skill, `shared/tool-use-concepts.md`).
- Haiku 4.5 rejects `effort` and has no adaptive thinking (claude-api skill, Thinking & Effort table).
- Prompt caching stays in place. Haiku's minimum cacheable prompt is 4096 tokens, so a shorter policy prompt simply won't be cached. That costs nothing extra.

## DO NOT TOUCH

`assistant-prompt.ts`, `assistant-reply.ts`, `answer-question.ts`, `assistant-failure.ts`, `send-chat-message.ts`, the admin chat-policy files, migrations, and `wrangler.jsonc`.

## Downstream Impact Analysis

### Level 1 — Direct
Files: `src/lib/chat/claude-model.ts`
Functions/contracts affected: `fetchClaudeReply` request body. The exported signatures don't change.

### Level 2 — Dependent
Files: `send-chat-message.ts`, `admin/chat-policy/actions.ts`, `admin/chat-policy/test-chat-actions.ts`
Functions/contracts affected: none. They receive the same `AnswerModel` type.
Risk: low. Answer quality may differ, and the owner reruns the chat-policy tests to measure it.

### Level 3 — Cascading
Files: chat UI, chat logs
Functions/contracts affected: none.
Risk: none.
