# Phase 5 — Chat Assistant — Plan

Status: **built** (2026-09-25) on branch `phase-5-chatbot` (from `build1`).
Parent plan: `docs/cwr-website-build-plan.md` (Phase 5, tasks 17–19).

## Goal

Visitors can ask the "CWR Assistant" questions and get answers drawn only from the owner's published policy (each citing its policy section), or hand the question to a person through the inbox; the owner edits, tests, versions, restores, and publishes that policy in the admin portal, and owners and managers can read every logged chat.

## Scope

**In scope**
- Task 17: chat widget (Style §11.13): desktop "Chat with us" launcher, mobile action-bar Chat button, 380px panel (full screen on phones), "AI · NOT A PERSON" label, "Talk to a person" always visible, "Source: Policy · [section]" line on answers. The panel's code loads only when the visitor opens it (Features §2).
- Task 18: server side: answers only from the published policy, section citations checked on the server, prompt-injection defenses, financial/ID numbers blocked and never stored, Fair Housing and no legal/lending/pricing advice rules, handoff to the inbox (`source = chat_handoff`), every chat and handoff logged, bot check + rate limits + cost guard.
- Task 19: owner-only "Chatbot policy" area: edit or upload the policy, live test chat on the unsaved text, test questions, test run, version history with one-click restore, publish only after a passing run.
- Owner/manager "Chat history" area for the weekly review (Features §2 "log every chat").

**Out of scope**
- Live person-to-visitor chat ("You're now chatting with a person" in the design kit). Handoffs arrive in the inbox and are answered by email/phone, as decided in Phase 4.
- Privacy policy wording about chat data (Phase 6, task 21).
- Streaming answers word by word (answers are short; one reply per question keeps the server checks simple).

## Resolved decisions

| # | Question | Decision | Source |
|---|---|---|---|
| 1 | Model | `claude-opus-5` (newest Claude model, confirmed with the claude-api skill), adaptive thinking, effort `low` (chat), JSON reply via structured outputs (`messages.parse` + Zod), `fallbacks: "default"` so a declined request is retried on another model; a final refusal becomes a handoff | Handoff notes; claude-api skill defaults |
| 2 | Where it runs | Server actions only; `ANTHROPIC_API_KEY` is a Worker secret, never `NEXT_PUBLIC_`. No new CSP host (the browser only talks to the site) | Infra §2, Features §2 |
| 3 | Reply shape | `{ outcome: "answer" \| "handoff", reply, citedSections[] }`. The server keeps an answer only if every cited section is a real heading in the published policy and at least one is cited; otherwise it becomes a handoff | Features §2 "each answer cites" |
| 4 | Policy sections | Every Markdown heading line (`#` … `######`) in the policy is a section. A policy needs at least one heading to be saved | Features §2 |
| 5 | Conversation history | Kept on the server (`chat_messages`), never taken from the browser, so visitors cannot plant fake assistant turns. The browser keeps only the session id and what it shows (sessionStorage, so it survives page loads in one tab) | OWASP LLM01 |
| 6 | Restricted data | SSN-shaped numbers (3-2-4 or 9 digits), any 12–19 digit number, and 6–17 digit numbers right after words like account, routing, card, license, passport, or "ID number" are caught before the model: the model never sees them, the log, inbox, and widget show "[number removed]", and the visitor is asked not to share them. Phone numbers, ZIP+4 codes, prices, and listing/MLS ids pass | Features §2 |
| 7 | Leak guard | The system prompt carries a marker line; a reply containing it, or repeating 20+ words of the policy in a row (ignoring case, punctuation, and formatting), is replaced by a handoff. Paraphrase cannot be detected in code; the built-in injection test and the prompt rules cover it | Features §2 "never expose the policy file or system prompt" |
| 8 | Abuse and cost | Turnstile to start a chat and to hand off; `CHAT_RATE_LIMITER` 10 messages per visitor per minute; 20 visitor messages per chat; 1,000 characters per message; at most 200 new chats per hour site-wide, after which chat offers "Talk to a person" only | Infra §2 |
| 9 | Not ready states | No published policy, no API key, the hourly cap reached, or the model failing → a friendly "a person will help" reply with the handoff form. Nothing breaks the page | Infra §3 fail gracefully |
| 10 | Handoff | Name + email or phone + question (+ Turnstile). Goes through `submitNewRequest({ source: "chat_handoff" })`; the inbox message holds the question and the chat so far (from the server log). The chat is linked to the thread. Visitor sees "Someone from our team will reply within one business day" | Features §2, Phase 4 |
| 11 | Test run | Runs the owner's active test questions plus 4 built-in safety checks (prompt injection, ID numbers, Fair Housing steering, lending advice) through exactly the visitor pipeline, 4 at a time. Needs at least one owner question. Saved by a new service-only `cwr.record_chat_policy_test_run()` that refuses the result if the draft or the questions changed during the run, and stamps the run with the exact draft save and question-list time it checked; publishing requires those stamps to match exactly | Admin §6 |
| 12 | Restore | Copies the old version's text into a new draft (history is never rewritten); publish still needs a passing run | Admin §6, migration 0400 |
| 13 | Editing | The editor always works on the newest draft; saving when no draft exists starts a new version. "Upload" reads a .txt or .md file into the editor in the browser (no file is stored) | Admin §6 |
| 14 | Chat history access | Owners and managers (matches existing RLS "Editors read chat sessions"); staff see handoffs in the inbox only | Parent plan role table, RLS |
| 15 | Review signal | New nullable `chat_messages.outcome` (answer / handoff) so the weekly review can filter "handed to a person" | Features §2 |

## Architecture context

- Widget: `ChatLauncher` (tiny, in the site layout) listens for "open chat" and loads `ChatPanel` with `next/dynamic` on first open. The action bar's Chat link keeps `href="/contact"` as the no-JavaScript fallback.
- `sendChatMessageAction` → validate → rate limit → session (new: Turnstile + hourly cap) → restricted-data check → `answerQuestion()` (Claude) → log both messages → reply.
- `answerQuestion()` is shared by the visitor chat, the owner's live test chat, and the test runner, so what is tested is what visitors get.
- Admin actions use `runAdminAction` / `runQuickAction` with `OWNER_ROLES` (policy) and the session client (RLS). Test runs are recorded with the service client through the new SQL function.

## Task breakdown

1. Migration `20260925001500_cwr_chat_assistant.sql`: `chat_messages.outcome`; `cwr.record_chat_policy_test_run()` (service role only, revoked from public/anon/authenticated). pgTAP `110-chat-assistant.test.sql`.
2. Pure chat logic `src/lib/chat/`: `policy-sections.ts`, `restricted-data.ts`, `assistant-prompt.ts`, `assistant-reply.ts`, `chat-schemas.ts` (+ unit tests).
3. Model call `src/lib/chat/claude-model.ts` and `answer-question.ts` (injectable model, unit-tested with a fake).
4. Visitor server side: `src/lib/chat/chat-log.ts` (service-role session/message writes), `src/lib/chat/chat-actions.ts` (send message, hand off); `rate-limit.ts` gains the chat limiter; `wrangler.jsonc` `CHAT_RATE_LIMITER`; `.env.example` `ANTHROPIC_API_KEY`.
5. Widget `src/components/chat/`: launcher, panel, message list, composer, handoff form, open-chat link; site layout + action bar wiring; design tokens only.
6. Policy admin: `src/lib/admin/chat-policy/` (queries, actions, test runner), `app/admin/(portal)/chat-policy/page.tsx`, components in `src/components/admin/chat-policy/`.
7. Chat history: `src/lib/admin/chats/queries.ts`, `app/admin/(portal)/chats/page.tsx` + `[id]/page.tsx`.
8. Navigation + dashboard: `ADMIN_AREAS` gains "Chatbot policy" (owner) and "Chat history" (owner, manager); dashboard stats lines.
9. Tests: unit (above), pgTAP, Playwright (widget label/launcher/mobile, handoff → inbox, not-ready reply, policy editor owner-only, save/version/restore, test-run needs key, publish after a passing run, chat history).

## Assumptions

- The owner adds the `ANTHROPIC_API_KEY` Worker secret and creates the `CHAT_RATE_LIMITER` (namespace 1002) with the other launch settings (Phase 7 runbook). Until then chat hands every question to a person.
- Anthropic usage is billed to the owner's Anthropic account; the caps in decision 8 bound the cost.
- CI has no API key, so browser tests cover the not-ready path, and the model path is covered by unit tests with a fake model.

## DO NOT TOUCH

Parent-plan list (incl. Google Workspace records, `docs/constitution/*`, design reference); migrations up to `20260925001400`; pgTAP `000`–`100`; Phase 0–1 test files.

## Edge cases (most → least critical) and solutions

| # | Edge case | Solution |
|---|---|---|
| 1 | A visitor tricks the bot into revealing the policy or its instructions | Visitor text is only ever a question; marker and long-copy checks replace leaks with a handoff; a built-in injection test runs before every publish |
| 2 | Bot gives advice outside policy (legal, lending, pricing) or steers by protected class | Rules in the system prompt, answers must cite real sections or become a handoff, built-in Fair Housing and lending tests block publishing a policy that fails them |
| 3 | Visitor types an SSN or card number | Caught before the model, never stored, visitor told not to share it |
| 4 | Bots run up the Anthropic bill | Turnstile per chat, per-visitor limit, 20 messages per chat, 200 new chats per hour site-wide |
| 5 | Owner publishes an untested edit | Database refuses publish without a passing run newer than the last edit; the run is refused if the text or questions changed while it ran |
| 6 | Someone reuses another visitor's session id | Ids are random 122-bit values held only in that tab; history is read from the server only for chats active in the last 24 hours |
| 7 | Claude is down, slow, or declines | 30-second limit, one retry, server fallback model; then a friendly handoff reply |
| 8 | No policy published yet / key missing | Chat still opens and offers "Talk to a person" right away |
| 9 | Manager or staff opens the policy page | Owner-only in the menu, the page check, the actions, and RLS |
| 10 | Chat widget slows the page | Only a small launcher ships with the page; the panel and bot check load on first open |
| 11 | Visitor reloads the page mid-chat | The tab keeps the session id and messages; the server keeps the history |

## Downstream Impact Analysis

### Level 1 — Direct
New migration, `src/lib/chat/*`, chat components, admin chat-policy and chat-history pages, `src/lib/security/rate-limit.ts` (adds a limiter), `src/components/layout/action-bar.tsx` (Chat opens the widget), `app/(site)/layout.tsx` (launcher), `src/lib/admin/navigation.ts`, `src/lib/admin/dashboard.ts`, `wrangler.jsonc`, `.env.example`, `package.json` (`@anthropic-ai/sdk` 0.128.0).

### Level 2 — Dependent
- Every public page now includes the launcher. Risk: low — kept tiny; Lighthouse budget (200 KB script) stays enforced in CI.
- `wrangler.jsonc` rate-limit binding: deploys need namespace 1002 to be valid. Risk: requires plan entry (runbook, Phase 7).
- Inbox receives `chat_handoff` threads through the Phase 4 intake; alert recipients already offer "chat" alerts. Risk: none.

### Level 3 — Cascading
- Anthropic receives visitor questions (owner-approved service, approval #2). The privacy policy must describe this before launch (Phase 6 task 21). Risk: requires plan entry (tracked in Phase 6).
- Retention: chats purge one year after the last message (existing job). Risk: none.

## Launch notes (for the Phase 7 runbook)

- Worker secret `ANTHROPIC_API_KEY`; Cloudflare rate-limit namespace `1002` (`CHAT_RATE_LIMITER`).
- Owner writes the first policy, adds test questions, runs the tests, and publishes before the site goes live.

## Verification (2026-09-25)

| Check | Result |
|---|---|
| Unit tests | 223 passed (incl. answer checks, number filter, hand-off, test grading, send-message paths with a fake model) |
| Database tests (fresh database) | 123 passed (12 files, incl. new `110-chat-assistant`) |
| Playwright, CI setup | 236 passed — incl. launcher and AI label, Escape/focus return, phone full screen and focus trap, axe on the open chat, panel code not loaded until opened, not-ready reply, chat kept across page loads, hand-off → inbox with transcript → chat history, owner-only policy page, save/test/publish/restore |
| lint, typecheck, db:check, db:lint, design:check, dependency scan, Workers build + `wrangler deploy --dry-run` (CHAT_RATE_LIMITER listed) | pass |
| Lighthouse (home, desktop) | performance 100, accessibility 100; page scripts 152 KB (budget 200 KB) |
| Independent review | 0 high; 2 medium (bank-number gaps, copy guard easy to reformat around), 8 low (publish race, test-list read split, page/database ready-check mismatch, shortened hand-off transcript, unredacted widget text, no phone focus trap, hand-off re-linking, hourly-cap overshoot) — all fixed except the hourly-cap overshoot (bounded by the bot check); re-review found 2 more low (ZIP+4 and listing ids blocked; copy check cost) — fixed |

Found and fixed while testing in a real browser: newer Chrome returns a Promise from `scrollIntoView`, which crashed the page when used as an effect's return value; multi-row inserts fill missing columns with null (not their default).
