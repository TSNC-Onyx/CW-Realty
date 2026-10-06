# Chat emergency reply: plan

Owner approved the wording and asked for the build on 2026-10-05. It ships before the chat button tree.

## Goal

A chat message about an emergency always gets the owner's fixed emergency reply, never an AI answer. This holds even when the assistant is off, has no published policy, or Claude fails.

## Why

With Claude Haiku 4.5, "There's a gas leak at my rental. What do I do?" was handed off with "we'll get back to you within one business day" (policy test run, 2026-10-05).

## Approved wording

> If you're having any emergency (fire, flood, gas, etc.), call 911 first. Then call or text our office. For homes we manage, we coordinate emergency repairs 24/7.

Under that reply, the chat shows tap-to-call and tap-to-text links with the office number from site settings. When settings are unavailable, the links are left out.

## Scope

In scope:
- `src/lib/chat/emergency.ts` (new): phrase detection and the emergency reply.
- `src/lib/chat/handoff-text.ts`: `EMERGENCY_TEXT`, kept import-free so the browser can use it.
- `src/lib/chat/answer-question.ts`: check before the model, so the owner's test chat and test runs match visitors.
- `src/lib/chat/send-chat-message.ts`: check before the assistant-off, no-policy, no-key, model-failure and hourly-cap paths.
- `src/components/chat/chat-message-list.tsx` and `chat-panel.tsx`: call and text links under the emergency reply.
- Unit tests.

Out of scope: the button tree, the policy text, the per-IP rate-limit and chat-full messages, Claude settings, and the database.

## Design

- `isEmergencyMessage(text)` matches urgent phrases: gas leak or smell, fire (but not fireplace, fire pit or fire insurance), smoke filling a room, carbon monoxide, flooding or a burst pipe (but not flood zone or flood insurance), sparks, "emergency", and "911". A false alarm only shows safety advice. A miss could leave someone waiting a business day.
- `getEmergencyReply(sections)` returns outcome `answer` with the fixed text. It cites the policy's Emergencies section when one exists, so the source line and the owner's test expectation still work.
- The emergency check comes after the restricted-number check, so SSNs, card numbers and the like are still never stored.

## DO NOT TOUCH

`claude-model.ts`, `assistant-prompt.ts`, `assistant-reply.ts` checks, `test-verdict.ts` (`SAFETY_CHECKS_VERSION` stays as is because the prompt, model and settings are unchanged), and migrations.

## Downstream Impact Analysis

### Level 1 — Direct
Files: emergency.ts, handoff-text.ts, answer-question.ts, send-chat-message.ts, chat-message-list.tsx, chat-panel.tsx
Functions/contracts affected: `fetchAssistantReply` and `sendChatMessage` can return the emergency answer without calling Claude. `ChatMessageList` gains a `contact` prop.

### Level 2 — Dependent
Files: admin test-runner.ts and test-chat-actions.ts (use `fetchAssistantReply`), and the chat log (records the reply like any answer).
Risk: low. Emergency questions now pass with the fixed text.

### Level 3 — Cascading
Files: none
Risk: none
