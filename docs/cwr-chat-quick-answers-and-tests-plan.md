# Chat quick answers editor and test questions redesign: plan

**Status:** owner approved all five decisions on 2026-10-06 ("1 yes, 2–5 ok") and the build followed under /strict-code. BUILT on `claude/chat-quick-answers-tests`; see §Implementation notes. The quick-answer drafts go into draft v2 when this merges.
**Base:** `build1` @ 6b0fa70 (PR #31 merged). **Branch:** `claude/chat-quick-answers-tests`.
**Wording rule:** policy text, including the quick answers, never goes in this repo. The owner report holds the drafts, and the DB holds the real text.

## Goal

1. The owner gets ready-to-use quick answers.
2. The owner can edit quick answers in a simple form instead of raw policy text.
3. When a test fails, the owner sees in plain words what happened, who can fix it, and one-click ways to fix it. Failures the owner can't fix are reported to the developer automatically.

## Evidence (production, read-only, 2026-10-06)

- Draft v2 (unpublished) has 20 sections and no quick answers. Live is v1.
- The latest run: 4 of 48 failed.
  - **3 built-in safety checks.** The AI declined correctly but in its own words, and built-ins require the approved wording. The owner can't fix these from the policy.
  - **1 owner test** ("Am I talking to a real person?"). The AI's reply was right but was filed as small talk instead of an answer citing "About this chat assistant".

## Sources (graded against)

- **S1** Anthropic, *Create strong empirical evaluations*: specific success criteria, code-graded checks first, edge cases.
- **S2** OpenAI eval best practices: golden set as a regression suite, deterministic graders for exact fields, gate publishing.
- **S3** promptfoo: per-assertion results; deterministic `contains`.
- **S4** Google PAIR *Errors + graceful failure*: tell user errors from system errors; let users correct; explanations must help predict, verify, or correct.
- **S5** Microsoft HAX G9–G11: support efficient correction; explain why the system did what it did.
- **S6** NN/g error-message guidelines and scoring rubric: what happened plus how to fix it, next to the cause, plain words, never blame; progressive disclosure.
- **S7** LangSmith/Ragas: golden datasets, turn real misses into tests, faithfulness first.
- **S8** Non-determinism guidance: pass@k; stable pass / flaky / stable fail instead of a binary result.
- **S9** Approval (snapshot) testing: accepting a new output as the baseline is a deliberate human step.
- **S10** WCAG 2.2 AA and the site's Style and Admin rules.

## Design

### A. Quick answers (content)
- Twelve drafts in the owner report, each 25 words or fewer and drawn only from draft v2 facts. Two of them need the owner to confirm the facts ("Find a place to rent", "Request a repair").
- After approval, they're added to **draft v2** in the database as `Quick answer: …` sections. The draft stays unpublished; the owner tests and publishes as usual.

### B. Quick answers editor (Admin → Chatbot policy → "Chat topic buttons")
- It replaces the read-only checklist. There is one row per button, showing:
  - the label, with the page it links to, read-only;
  - a text box with a live word count ("aim for 25 words", hard limit 600 characters);
  - a chat-style preview;
  - its status (Ready / Missing / Too long).
- **Save topic answers** writes the `Quick answer: …` sections into the working draft (it creates one from the live text if none is open). It uses the same save rules as the policy editor: the updated-at check, the draft lock, and "save your other changes first" while the main editor holds unsaved text. The main editor shows the new text after saving.
- **The AI never sees quick-answer sections.** `getPublicPolicy` and `getPublicSections`, as given to the model, leave them out. They repeat other sections, and if the model cited them, today's owner tests citing "Buying a home" etc. would start failing. The buttons still read them.

### C. Test question structure
1. **"Section it should cite" becomes a dropdown** of the draft's public sections, plus "Any section". There are no more typos or private sections. Existing free-text values are kept, and the dropdown shows them flagged when they no longer exist.
2. **A third expectation**, "Answer, or a friendly reply in its own words". It passes on a policy answer or an AI-written small-talk reply, but not on "a person will help". The column is `chat_policy_tests.allows_friendly_reply boolean default false`.
3. **An optional "Should mention" field**, up to 3 short phrases. Each must appear in the reply (case-insensitive), as a deterministic fact check (S1, S3). The column is `chat_policy_tests.must_mention text[] default '{}'`.
4. **Coverage hints:** "No test covers *Seller add-ons*", with an **Add a test** link that prefills the section (S7).

### D. Stability (S8)
- A question that fails is asked once more, in the same run.
- **Owner tests:** pass on either try. A pass on the second try shows as "Passed · unstable (1 of 2)", with a tip to make the policy clearer.
- **Built-in safety checks:** must pass every try.
- Cost: one extra AI call per failure only.

### E. Failure reasons and fixes (S4, S5, S6, S9)

Each failed row is expanded by default. It shows **Expected** beside **What the assistant did**, the reply, one plain-words **Why**, and buttons:

| Why | Who can fix | Buttons |
|---|---|---|
| Offered a person instead of answering | Owner | Edit this section · Accept a friendly reply (if the AI wrote small talk) · Change to "should hand off" · Try it in the test chat |
| Answered, but should offer a person | Owner | Accept: answering is fine · Edit this section (or mark it private) |
| Answered from a different section | Owner | Accept "[cited section]" · Any section is fine · Edit this section |
| Didn't mention "[phrase]" | Owner | Edit this section · Edit the phrase |
| Didn't reply (connection) | Nobody (retry) | Run the tests again. If it repeats, it's reported automatically |
| Built-in safety check | Developer | No owner buttons. "Your developer has been notified automatically." The failure goes to the Problems log (`chat_policy.run_tests`, code `safety_check_failed`) |

- "Accept …" buttons update the test through a new `updatePolicyTestAction`, with Undo (S9: a deliberate human step).
- "Edit this section" scrolls the policy editor to that heading and selects it.

### F. Results layout
- The summary line becomes three counts: **Needs your attention · Developer notified · Passed** (and unstable).
- Order: owner-fixable failures, developer-notified, untested, out of date, passed. Passed rows stay folded (S6, progressive disclosure).
- Status is shown with an icon plus words, never color alone.

### G. Fixing today's built-in failures at the source
- A server rule: when a visitor's message is a steering request (`isSteeringRequest`, round 3) or asks for the assistant's rules or instructions (a new `isInstructionsRequest`), a small-talk reply is replaced with the approved "a person will help" line. The three current built-in failures then pass every time.
- `SAFETY_CHECKS_VERSION` is bumped, so every policy is re-tested once.

## Regression guard

- No change to the visitor chat except G, which only swaps AI-written small talk for approved wording on steering and instructions questions.
- Old tests keep working. The new columns default to today's behavior, and old run results without the new fields read as today.
- The publish rule only gets stricter for built-ins. The owner-test pass rule adds the retry.
- Migrations are additive only.
- Every existing unit, e2e, and pgTAP test must pass, plus new ones for every edge case.

## DO NOT TOUCH

`claude-model.ts`, `assistant-prompt.ts` (model instructions), `emergency.ts`, `restricted-data.ts`, the guided tree and labels, Turnstile and the limiters, and the public chat layout.

## Downstream impact

- **L1:**
  - lib: `test-verdict.ts`, `test-rows.ts`, `test-runner.ts`, `actions.ts`, `queries.ts`, `policy-sections.ts`, `guided-steps.ts`, `answer-question.ts` (G), `conversation-checks.ts` or `steering-terms.ts` (G)
  - admin UI: `policy-test-list.tsx`, `policy-test-form.tsx`, `policy-test-panel.tsx`, the quick-answer editor
  - one migration
- **L2:** the admin page, the test batches and jobs, the fingerprint test (version bump), and the e2e admin chat-policy spec. Risk: medium. Grading changes need full test coverage.
- **L3:** the Problems log (a new code on an existing action), the weekly review, and the privacy policy (unchanged: no new data).

## Verification

Unit tests for each edge case, the e2e owner flow (edit quick answers, a failed test, Accept, re-run, publish), axe on the admin page, the existing suites, then a local preview with real content (memory: reset and import after tests).

## Implementation notes

- **The AI never sees quick-answer sections.** `getAssistantPolicy` and `getAssistantSections` (policy-sections.ts) feed the model and its citation check. The topic buttons, the admin editor, and the owner's section list read the policy separately.
- **The form's section list** is `getAssistantSections`: the public sections minus quick answers. A question saved earlier that cites a private section is still flagged in the list.
- **"Should mention"** is entered as comma-separated phrases (up to 3, each 60 characters or fewer) and stored in `must_mention text[]`, with a check of 3 or fewer.
- **The expectation is one select with three choices.** It maps to `expected_outcome` plus `allows_friendly_reply`.
- **Retry.** Owner questions are retried once on failure, and a second-try pass is stored as `isUnstable`. Built-in checks get one try. Each batch's failed built-ins are logged as `chat_policy.run_tests` / `safety_check_failed`. `BATCH_SIZE` dropped from 8 to 6 (24 model calls at most per request). A run that's in progress during the deploy stops with the existing "safety checks changed during this run" message, and the owner runs again.
- **New problem-catalog actions:** `chat_policy.update_test` and `chat_policy.save_quick_answers`, in the migration and in code.
- **Accept fixes** (`updatePolicyTestAction`) change only the expectation and section, and each has Undo. Changing a test makes the run out of date, as before.
- **The topic answers form** uses the same updated-at guard as the editor. It can't save while the policy editor has unsaved text, and the page's shared unsaved flag covers both, so Publish, Restore, and tests wait.
- **Safety guard:** `getGuardedSmallTalk` replaces AI-written small talk with `HANDOFF_TEXT.needsPerson` when `isSteeringRequest` or `isInstructionsRequest` matches. The new hand-off reason is `safety_wording`. `SAFETY_CHECKS_VERSION` is now `2026-10-06-r4`.
- **"Start over"** stays "All topics" (unchanged from #31).

