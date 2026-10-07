# Document reconciliation — plan

> Status: **APPROVED rev 2 (2026-10-04)**. Owner said "build it, rule books too" and "document fixes only" on 2026-10-04. D1 = yes (constitution 02/03 class A corrections approved); D2 = keep the rule, list the gap. No code changes in this task.
> Base: `build1` @ 496064f (after PR #25). "Current state" = this commit. Unmerged branches (`claude/listing-statuses`, `claude/video-auto-cover`) and open PRs (#5, #8, #18–#21) are **not** current state.

## Goal

Every living doc in the repo states only things that are true of `build1` @ 496064f, and every place where the code falls short of an owner rule is written down once instead of silently drifting.

## How each mismatch is sorted

Every finding from the 4-part audit (2026-10-04, evidence = file:line in code) goes into exactly one class. Only class A changes doc text.

| Class | Meaning | Action |
|---|---|---|
| **A — doc is wrong** | The doc describes the current system and the description is false, or points at something that no longer exists | Correct the line in place (present tense, current state) |
| **B — code is wrong** | The doc states an owner-approved design or rule and the code fails it by mistake | Doc unchanged. Logged as a separate code fix (not in this task) |
| **C — rule not met yet** | An owner rule the system doesn't meet yet (not a mistake, just not built or deferred) | Rule unchanged. One row in the build plan's open items points to the gap list in this plan |
| **H — history** | Plan docs and frozen references | Bodies never edited. A stale status header gets one appended status line (Nygard ADR rule: mark, don't rewrite) |

## Scope

**In scope (living docs):** `README.md`, `docs/runbooks/chatbot-launch.md`, `docs/runbooks/problem-alerts.md`, `docs/reference/site/navigation-reconciliation.md`, `docs/constitution/02-style-ui-ux.md` and `03-features-navigation.md` (class A only, after D1), the "Open items" table in `docs/cwr-website-build-plan.md`, and the status header lines of plan docs (class H).

**Out of scope:** any code, test, config, migration, or workflow change; class B fixes (separate task); rewriting rules in `01-infrastructure.md` / `04-admin-control-system.md` (all their findings are class C); frozen references; memory files; docs that exist only on unmerged branches.

## Task breakdown

Branch `claude/document-reconciliation-dc3969` from `build1`. One commit per step; one PR into `build1`.

### Step 1 — Runbooks (class A)

`docs/runbooks/chatbot-launch.md`
- :63 — move `wrong_site` out of the critical row into a warning row (code: `src/lib/security/visitor-bot-check.ts:17`).
- :26-30 — add the **Save draft** step before tests; say Run and Publish appear only after a saved draft (`policy-editor.tsx:78`, `policy-test-panel.tsx:58`).
- :61-74 codes table — add the missing codes: `site.chat_assistant` `timeout`/`network`/`http_429`/5xx (`assistant-failure.ts:25-38`), `site.chat_message` `outdated_page`/`rate_limiter_down` (`send-chat-message.ts:35`, `rate-limit.ts:26`), `site.chat_widget` `outdated_page_loop` (`chat-composer.tsx:68`). Severity values copied from code.
- :76 — "critical" → "error or critical" (alert rule rank ≥ 3, `20260928000200_cwr_problem_tracking.sql:606`).
- :19 — "keeping what was typed" → sign-in pages keep the email only (`sign-in-recovery.tsx:24,30`).
- :31 — "about 20 seconds" → "up to about a minute", matching what visitors are told (`chat-message-list.tsx:12`).

`docs/runbooks/problem-alerts.md`
- :7 — add website visitors to what is recorded (`20261003000100_cwr_visitor_problems.sql`).
- :45-46 — mark both rows "only while problem emails are on" (heartbeat row deleted while paused; Worker check runs only in `scheduled`). Rows stay: they become true again on resume.
- :48-49 — notice names → exact code titles "The problem log couldn't save a problem", "Problem emails are failing" (`health-notices.ts:54-55`).
- :48 — drop "(build plan open item 1)" (item 1 is Done).
- :55-58 — no edit (owner-only transition from SQL is unverified; not a proven error).

### Step 2 — README and navigation reference (class A)

`README.md`
- :6 — CI runs on every pull request and on pushes to `build1` and `main` (`.github/workflows/ci.yml:4-7`).
- :11-14 — add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the public build variables, noting it is set in the Cloudflare build (the GitHub `deploy.yml` doesn't pass it yet — logged as class B item B6).

`docs/reference/site/navigation-reconciliation.md`
- :34-63 — add a row for `/services/selected-services` and the 301 from `/services/seller-consulting` (`next.config.ts:12-14`).
- :24-28 — menu labels to the sentence case the site shows (`src/lib/site/navigation.ts:25-51`).
- :8, :32 — "Equal Housing Opportunity" is footer text, not a link (`site-footer.tsx:82`).

### Step 3 — Constitution, class A only (needs D1 yes)

`docs/constitution/02-style-ui-ux.md`
- :223 — "five menu items" → "six" (matches :34, :225, and `navigation.ts:19-55`).
- :243 — plan card: drop the leftover 'L "Ask for pricing" button' and "seller consulting" source (superseded by :244-245 and PR #22); state the carousel below 1024px / grid from 1024px that :245 and the code already use.
- :207 — home hero row: "slideshow, at least 640px tall (42.86vw)" to match :213 and `globals.css:184-196`.
- :229 — mobile menu button reads "Call (phone)", or "Contact us" when no phone is set (`mobile-menu.tsx:76`).
- :266 — success message is an inline confirmation with an H1-styled heading, not a separate page (`request-form.tsx:66-68`).
- §11.10 / §11.13 — add the shipped components and variants §11.15 requires to be listed (each one line, values copied from code): download row link variant (`homework.ts:116-135`); services overview card, home path card, partner card, Homework video card, CTA box; dashboard Problems card and health notices; pagination; TouchUp step badges; testimonial list; About journey list.
- :3 — append to the amendment log: "§11.9, §11.10, §11.13 and the image table corrected to match the built site with owner approval on <date> (`docs/cwr-document-reconciliation-plan.md`)."

`docs/constitution/03-features-navigation.md`
- :3 — add the missing amendment record for the 2026-10-02 "public policy content may be quoted" change at :23 (`docs/cwr-chat-policy-test-batches-plan.md:183`).
- :4 — say the sitemap and routes files are historical and `navigation-reconciliation.md` is the working source (that doc says so at its :3).

### Step 4 — Plan status lines (class H)

Append one line (never rewrite) to the header of each stale plan: "**Merged** into `build1` by PR #N (commit) on <date>."
- `cwr-website-build-plan.md:3` (Phases 1–4 merged by PRs #1–#4; later rounds by #11–#25)
- `cwr-site-review-round-plan.md:3` and `:174` (PR #11)
- `cwr-reliability-round-plan.md:3` and `cwr-stale-quick-check-addendum.md:3` (PR #23)
- `cwr-chat-policy-test-batches-plan.md:3-6` (Parts A, B, C built and merged, PR #25)
- `cwr-phase-1..5` plans (PRs #1, #2, #3, #4, #6), `cwr-selected-services-plan.md` (PR #22), `cwr-error-tracking-plan.md` (PRs #16, #17), `cwr-admin-console-header-redesign-plan.md` (fast-forwarded, `412f1cd`)
- `seller-consulting-page-plan.md:3` — "**Superseded** by `docs/cwr-selected-services-plan.md` (PR #22); the old address 301s there."

### Step 5 — Gap log (classes B and C)

One new row in `docs/cwr-website-build-plan.md` "Open items": "Known gaps between the code and the constitution, and code bugs found on 2026-10-04: see `docs/cwr-document-reconciliation-plan.md` → Gap log." The gap log below goes into the repo with this plan.

## Gap log (not fixed by this task)

**B — code bugs (separate fix task each, owner picks when)**
| # | Gap | Evidence |
|---|---|---|
| B1 | The 1280px screen size was never set up, so 1280px+ rules on Selected services don't apply (byline stays 5/12; wide plan button) | `globals.css:14-15`; `xl:` in `selected-services/page.tsx:27,71,90,93`, `plan-card.tsx:24` |
| B2 | Chatbot-policy filter buttons have rounded "pill" corners; §11.3 says 0 | `globals.css:652-665` |
| B3 | Chat panel logo has no gold ring (§11.7 "every placement") | `chat-panel.tsx:37` |
| B4 | Content width is 1184px at 1440px, not 1312px (padding inside the max width) | `section.tsx:17`, `site-header.tsx:14` |
| B5 | Grid gaps 32/64px, not 24px; no 8-column tablet grid | `globals.css:216`, `page.tsx:154` |
| B6 | GitHub `deploy.yml` (go-live path) doesn't pass the Quick Check site key | `deploy.yml:75-76` |
| B7 | A code comment still mentions seller consulting | `app/(site)/services/page.tsx:15` |

**C — rules not met yet (rule text unchanged)**
| # | Rule | Current state |
|---|---|---|
| C1 | 01:8 small merges to `main` | All work merges to `build1`; `main` waits for go-live (README) |
| C2 | 01:10/14 separate preview environment | Previews share the production database, queues and rate limiters (`wrangler.jsonc:26`) |
| C3 | 01:46 status changes only via the Workflow Engine | Alert delivery and digest-run states are set directly (`deliveries.ts:60-82`) |
| C4 | 01:41 every write audited | Chat-policy test job tables and system tables have no audit trigger |
| C5 | 01:63 heavy work never inside a request | Chat answers and policy test batches call Claude in the request |
| C6 | 01:72 alert on symptoms | Problem emails paused (open item 11) |
| C7 | 01:44 OpenTelemetry request IDs | Custom `x-request-id`, no OTel |
| C8 | 04:13 preview before publish | Listings only |
| C9 | 04:56 30-day trash | Owners can delete forever; recipients and memberships are hard-deleted |
| C10 | 02 §11.10 resource card, public breadcrumbs | Specified, never built |
| C11 | 01:12/13/32/35/53/56/65/69/72 (DORA, flags, SLOs, backups, search speed, advisors, load tests, real-user vitals, status page) | Not built; launch-phase items |

## Decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| D1 | May I correct the style and navigation rule books (Step 3) so they describe the site as built? Only descriptions change; no rule gets looser | **Yes** — they currently say things like "five menu items" when the site has six |
| D2 | Where the rule book and the site disagree on design (B1–B5), which one is right? | **Keep the rule book**, log the site differences as fixes for later. Changing the rule book would quietly lower a standard you approved |

## Assumptions

1. `build1` @ 496064f is the current state; nothing merges into it during the build (re-check `git log` before the PR).
2. Merges into `build1` deploy the `cw-realty` Worker through Cloudflare's Git build (build plan open item 2; error-tracking deploy 2026-09-30). Only README wording depends on this, and it is written to say where the setting lives, not how deploys are wired.
3. No code, test or script reads doc text. Verified: only comments in `navigation.ts` and `globals.css` mention docs; `scripts/check-design-tokens.mjs` reads `globals.css`, not the constitution.
4. Chatbot policy text is never committed (owner rule). Runbook edits mention screen labels and codes only.

## DO NOT TOUCH

- All code, tests, config, workflows, migrations: `app/`, `src/`, `tests/`, `scripts/`, `supabase/`, `.github/`, `wrangler.jsonc`, `next.config.ts`, `middleware.ts`, `worker.ts`, `package*.json`
- Frozen references: `docs/reference/site/CWR-routes.ts`, `CWR-sitemap.xml`, everything under `docs/reference/design/`, `docs/reference/brand/`
- Rule text of `docs/constitution/01-infrastructure.md` and `04-admin-control-system.md` (whole files)
- Plan doc bodies (only header status lines may get an appended line)
- `docs/constitution/02-style-ui-ux.md` lines ~100–110 and ~215 (status colors), which unmerged `claude/listing-statuses` changes
- Open PR branches #5, #8, #18–#21; unmerged branches

## Downstream Impact Analysis

### Level 1 — Direct
Files: the in-scope docs above. Contracts: none (Markdown only).

### Level 2 — Dependent
Files: future Claude sessions and the owner reading these docs; `navigation.ts` and `globals.css` comments that cite doc sections (section numbers unchanged). CI runs on the PR (lint, types, unit, db checks, secret scan) and must stay green; no doc is an input to any check.
Risk: low.

### Level 3 — Cascading
Files: `claude/listing-statuses` (edits 02 header + status lines) and PR #8 (may edit README) will need a small merge fix after this lands. Future rounds that amend the constitution add to the same header log.
Risk: low; requires plan entry (done: edge cases 3 and 5).

## Edge cases (most → least critical)

| # | Edge case (level) | Why it matters |
|---|---|---|
| 1 | A rule-book edit goes in without the owner's real yes (L1) | The rule books say they can't change without owner approval. Breaking that breaks trust in every rule. |
| 2 | A doc gets changed to match a code bug (L2) | That would "approve" the bug, and a later session would treat the mistake as the design. The site would never get fixed. |
| 3 | The unmerged listing-statuses branch or PR #8 changes the same doc lines (L3) | Two changes to one line clash when the second one merges. Done carelessly, one change silently erases the other. |
| 4 | A fix is written from a guess, not the code (L1) | Then the doc is wrong in a new way, which is worse because it looks freshly checked. |
| 5 | Problem emails get turned back on later (L3) | If the runbook rows about them were deleted, the owner would have no help when those warnings come back. |
| 6 | A plan's history is rewritten (L2) | Old plans explain why things were built. Editing them loses that reason forever. |
| 7 | Chatbot policy text slips into a runbook (L2) | The owner's rule is that policy text never goes into the code repo. A runbook example could leak it. |
| 8 | Something not in scope changes by accident (L1) | A stray edit to a code or frozen file could break the site or erase a reference. |
| 9 | A notice or button name in a runbook doesn't match the screen (L2) | The owner searches the screen for words that aren't there and gets stuck while fixing a real problem. |
| 10 | Line numbers cited in other docs shift (L3) | A few plans point at "line N". Edits shift lines and the pointers drift a little. |

| # | Solution |
|---|---|
| 1 | Step 3 only starts after the owner answers D1 in chat. Each rule-book file's header gets an amendment entry with the date and this plan's name. |
| 2 | Every finding is sorted A/B/C first. Only class A changes words; bugs go to the Gap log as B items. |
| 3 | Leave the lines that branch changes alone, keep the PR small, and merge it soon. The listing-statuses session gets a note to accept both header entries when it merges. |
| 4 | Every edit cites a code file and line, and is re-checked against that line just before writing. Unproven items (like the SQL resolve step) stay as they are. |
| 5 | Mark those rows "only while problem emails are on" instead of deleting them. |
| 6 | Plan docs get one new status line at the top, nothing else. The diff check proves bodies didn't change. |
| 7 | Runbook edits use only screen labels and problem codes. The diff is searched for policy wording before the commit. |
| 8 | `git diff --stat build1` must list only the in-scope doc files. A reviewer helper checks it against the DO NOT TOUCH list. |
| 9 | Notice and button names are copied exactly from the code strings, then searched in the code to confirm. |
| 10 | Prefer section names over line numbers in new text. Old pointers stay; they're still close enough to find. |

## Verification (post-build)

1. `git diff --stat build1` lists only in-scope docs; `git diff build1 -- app src tests scripts supabase .github` is empty.
2. For each changed plan doc, `git diff` shows only added header lines.
3. Every exact label written into a runbook is found by `grep -rn` in `src/` or `app/`.
4. CI on the PR passes (lint, typecheck, unit, db checks, secret scan).
5. A review helper re-checks each class A edit against its cited file:line and reports anything still wrong.

## Audit against documentation standards

| Criterion | Source | How the plan meets it | Grade |
|---|---|---|---|
| Accuracy: reference docs state facts, accurate and complete | Diátaxis, Reference | Every edit cites code evidence; post-build helper re-checks each one | A |
| Timeless, present-tense current state | Google developer style guide (Timeless documentation; Present tense) | Edits describe what the site does now; history goes only in dated amendment and status lines | A |
| Historical records aren't rewritten; superseded ones are marked | Nygard ADR practice | Plan bodies frozen; one appended status line; seller-consulting plan marked superseded | A |
| Docs as code: version control, review, CI | Write the Docs, Docs as Code | One branch, one PR, CI must pass, review helper, owner approval | A |
| Governance: protected docs change only with approval and a record | Constitution headers | D1/D2 gate plus amendment log entry | A |
| Minimal, no bloat | Doc-session add-or-skip test | One-line fixes; one open-items row; no new sections except the gap log in this plan | A |
| No regressions outside scope | strict-process DO NOT TOUCH | Docs-only diff, checked by `git diff` and CI | A |

Rev 1 → rev 2 changes from self-audit: rev 1 would have rewritten design rules to match the site (failed Governance and the "doc wins" line at 02:88 → now class B + D2); rev 1 deleted the paused-email runbook rows (would break when emails resume → now annotated); rev 1 had one open-items row per gap (bloat → one pointer row).

Sources: https://diataxis.fr/ · https://developers.google.com/style/timeless-documentation · https://developers.google.com/style/tense · https://csse6400.uqcloud.net/handouts/adr.pdf (Nygard ADR) · https://konghq.com/blog/learning-center/what-is-docs-as-code
