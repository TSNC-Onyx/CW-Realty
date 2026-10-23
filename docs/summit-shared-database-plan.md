Status: Approved 2026-10-22

**Accepted gaps** (owner, 2026-10-22): after grading round 3, "Requirements & verification" and "Regression safety" were graded B. The fixes the grader named (R4 anon grants; live cron baseline in Step 8 pre-step; invite expiry wording) were applied, and the owner accepted them without a fourth grading round.

# 623 Summit moves into the CW-Realty database project

## Goal
At the end, 623 Summit's live site (https://623summit.pages.dev) reads and writes its data only in its own `summit` schema inside the CW-Realty Supabase project and signs owners in through CW-Realty's login system, neither site can read or change the other's data (proven by R3/R4), and the old 623Summit project is paused.

## Fixed values
| Name | Value | Source |
|---|---|---|
| OLD | `jauwwpluqjeefokxolea` ("623Summit") | `list_projects`; 623 `supabase/config.toml` |
| CWR | `egadvqpatnlkvgiiszzx` (CW-Realty) | CW `scripts/push-auth-email-templates.mjs:16` |
| SUMMIT_ORIGIN | `https://623summit.pages.dev` | owner, 2026-10-22 |
| SUMMIT_ADMIN_URL | `https://623summit.pages.dev/admin` | `curl`: `/admin.html` returns 308 to `/admin` (Cloudflare Pages pretty URLs). 623 `resetRedirectUrl()` = `origin + pathname` (`assets/js/admin.js:144-147`), so the live `redirect_to` is `/admin` |
| Repos | CW-Realty (base `build1`; work in worktree `.claude/worktrees/623summit-cw-realty-db-migration-662273`, branch `claude/623summit-cw-realty-db-migration-662273`); 623Summit (`/Users/jr/Documents/GitHub/623Summit`, base `main`, new branch `claude/summit-shared-database`) | git |
| Versions | Supabase CLI 2.118.0 (CW `package.json` devDependency `supabase`); Deno 2.7.14 (local `deno --version`; 623 pins packages in `supabase/deno.lock`); 623 functions use `npm:@supabase/supabase-js@2.45.4` (import lines); Postgres 17.6 on both projects (`list_projects`) | as cited |

## Owner decisions (2026-10-22)
1. The 623 owner page gets the same robot check as CW (Cloudflare Turnstile).
2. New 623 owners are invited; open sign-up is removed.
3. 623 reset and invite emails carry 623 Summit branding.
4. Everything in OLD is test data: the 3 bookings, the getawaysj@gmail.com login and its owner-list row. **Nothing is copied** except the owner `onyxventuresnc@gmail.com`, who already has a CWR login and will use that same password (option A).
5. The Services menu link is a separate job.
6. No booking pause is needed (no real data).
7. CW's constitution is **not** edited. The note goes in a runbook instead, which needs no approval.

## Scope
**In scope**
- A `summit` schema in CWR with 623's final tables, functions, RLS, grants and two `summit_` cron jobs.
- One owner-list row (onyxventuresnc).
- 623's edge functions `submit-form` and `manage-booking` deployed to CWR, plus a new `summit-invite-owner`.
- 623 site changes:
  - point at CWR and select `summit`
  - Turnstile on sign-in and reset
  - remove sign-up
  - accept invites and add an invite form
  - match CWR's password rule
  - an `/admin`-only CSP
  - version bump, tests, docs
- CW-Realty changes: the migration, local config, 623 branches in the recovery and invite templates, a pgTAP test, a runbook, and a warning line in the email-outbox runbook.
- Switch-over, verification, and pausing OLD after 7 days.

**Out of scope**
- The Services menu link.
- Removing a 623 owner from the console (SQL on request, as today).
- CWR's older `public` app and its pre-existing exposures:
  - RLS off on `public.ref_counters`, `app_settings`, `chat_leads`, `chat_rate_limits`
  - `demo_tenant_scope using (true)` on `workflows`, `workflow_transitions`, `workflow_terminal_states`

  These are reported to the owner as a separate follow-up.
- The CW email-outbox rollout (`cwr.handle_auth_email` does not exist live).
- Copying any OLD data or Auth users.
- Deleting OLD.
- Any CW-Realty page or app code.

## Architecture context (files and live catalog read)
**OLD (623)**
- 11 migrations in 623 `supabase/migrations/` (20260711000000…20260924000000), all in `public`. Live `schema_migrations` shows the same 11 versions.
- Final live objects:
  - tables `inquiries, bookings, blackouts, admins, lookup_events, booking_payments`
  - functions `expire_stale_holds, generate_booking_reference, get_unavailable_ranges, is_admin, is_range_available, purge_old_technical_data, recent_lookup_count, recent_submission_count, record_lookup`
  - event-trigger function `rls_auto_enable` (trigger `ensure_rls`)
  - sequence `lookup_events_id_seq`
  - extensions `citext, pgcrypto, btree_gist, pg_cron`
  - cron `purge-old-technical-data 17 4 * * *`, `expire-stale-holds */15 * * * *`
  - no buckets
  - deployed functions `submit-form`, `manage-booking` and leftover `activate-admin` (code removed in 623 commit d2fe62c; **not moved**)
- `public.admins` = `(email citext primary key, created_at, label)` (migration 20260923000000:121).
- `is_admin()` compares `auth.jwt()->>'email'` with `admins.email`. RLS policies `*_admin_all` / `*_admin_read`.

**623 browser**
- `assets/js/api.js:14-15` holds the URL and key. `rpc()` posts to `/rest/v1/rpc/<fn>`; `rest()` calls `/rest/v1/<path>`; `callFunction()` hits edge functions.
- `admin.js`:
  - `authRequest()` → `/auth/v1/token` (≈102)
  - `requestPasswordReset()` → `/auth/v1/recover?redirect_to=` (≈149)
  - `takeRecoveryFromUrl()` accepts only `type=recovery` in the fragment (≈189-210), i.e. the implicit flow that `{{ .ConfirmationURL }}` produces
  - `signUp()` → `/auth/v1/signup` (≈1285)
  - `is_admin` is checked after every sign-in (1223, 1408, 1514, 1830)
  - `MIN_PASSWORD_LENGTH = 8` (54)

**623 functions**
- `createClient` at `submit-form/index.ts:75` and `manage-booking/index.ts:89`. They read `ALLOWED_ORIGIN`.
- `resolveAllowedOrigin` exists twice: `submit-form/validation.ts:309-318`, and a local copy in `manage-booking/index.ts:≈54`. It sets CORS only; it never rejects a request.

**623 tests**
- `cd supabase && deno task test`: 56 tests in `supabase/tests/site_contract_test.ts` and `functions/submit-form/validation_test.ts`.
- `deno task check` type-checks only the two functions listed in `supabase/deno.json`.
- Contract tests that this change touches:
  - no third-party resources (≈127)
  - the endpoint origin is allowed by `connect-src` (≈148)
  - `script-src 'self';` (174), checked against the **first** `Content-Security-Policy:` line in `_headers`
  - "every script a page loads exists on disk" (≈288; its `<script src=` regex would treat the Turnstile URL as a local path)
  - "the console keeps a complete sign-in lifecycle" (318-335; asserts `id="signUpView"` at 323)
  - the sign-up assertions (400-425) and the marks list (425)
  - the budget `jsTotal: 126` KB, with today's scripts at ≈123.5 KB (≈190-214)

**623 hosting**
- Cloudflare Pages. `_headers` has a single `/*` CSP block (live response confirms the same CSP). JS and CSS are cached 1 day (lines 34-38). `?v=` appears on 5 pages.

**CWR**
- CW objects are in `cwr`/`cwr_private`. App clients pin `schema: "cwr"` (`src/lib/supabase/server-client.ts:32`, `public-client.ts:27`, `service-client.ts:28`).
- `public` holds an unrelated older app; there are no name clashes with 623, but it has permissive policies.
- CWR lacks `citext` and `btree_gist`. It has `pg_cron`, `pgcrypto` and `pg_net`.
- Only Supabase's default event triggers exist.
- Live `pg_policies`: a signed-in non-member gets only anon-level reads (`redirects`, `site_settings`, `tenants`, `tracking_settings`).
- `cwr.check_scheduled_job_runs` watches only `jobname like 'cwr\_%'` (`20260928000200_cwr_problem_tracking.sql:861`).
- Live edge functions: `builtfor-screenshots`, `builtfor-test-img`, `generate-invoice-pdf`, `ai-chat`. `email-worker` exists in the repo but is not deployed.

**CWR auth** (`supabase/config.toml`)
- `enable_signup = false`, captcha `turnstile`, password `lower_upper_letters_digits` with a minimum of 8.
- `recovery.html` links to `{{ .SiteURL }}/admin/auth/confirm?token_hash=…`.
- Templates are pushed live by `scripts/push-auth-email-templates.mjs` (`--dry-run`, automatic backup, `--restore`).
- CW sends the captcha via supabase-js `captchaToken` (`src/lib/admin/auth-actions.ts:60,78`).

**CWR local email path**
- `supabase/config.toml:359-361` turns on `[auth.hook.send_email]` → `cwr/handle_auth_email` locally, so local Auth emails go to the outbox and the templates are not rendered.
- On the live project the hook is off: `cwr.handle_auth_email` doesn't exist there (catalog query), and rollout step 3 is pending.
- Any local template proof therefore needs the hook switched off temporarily (Step 0/5/7 note).

**CW rules that bear on this**
- Constitution `02-style-ui-ux.md:287` (Emails): every email the CW site sends uses CW branding, built by `email-worker/layout.ts`. 623's emails are 623's, not CW's. The 623 branch in the shared templates is an exception that the owner confirms at the Human Approval Gate. The constitution text itself is not edited (decision 7).
- `scripts/check-migrations.mjs` (`npm run db:check`, run in CI) rejects:
  - any `public.` reference
  - writes to `auth.`/`storage.`
  - `cron.unschedule('` for jobs not prefixed `cwr_` (line 26)
  - file names not matching `^\d{14}_[a-z0-9_]+\.sql$`

**CWR delivery**
- `.github/workflows/deploy.yml` triggers on `main` only. `build1` is the working default branch, and production migrations have been applied by hand via the Supabase tools with the owner's OK (project history: PRs #33, #35, #51, #53).
- CI (`.github/workflows/ci.yml`) runs on PRs:
  - `npm run lint`, `design:check`, `typecheck`, `worker:check`, `errors:check`, `npm test`
  - `npm run db:check`, `supabase db lint --local --schema cwr …`, `supabase test db`, `npm run db:catalog`
  - Playwright `npm run test:e2e`, Lighthouse
- pgTAP helper `cwr_test.sign_in` (`000-setup-helpers.test.sql:32-38`) sets `sub`, `role` and `aal` only, with no email.

## Requirements and acceptance checks
| # | Requirement | Pass/fail check |
|---|---|---|
| R1 | `summit` holds 623's final objects except `rls_auto_enable`/`ensure_rls` | The Step 3 parity query on CWR vs OLD differs only by the schema name and that documented omission |
| R2 | RLS on all 6 summit tables; grants equal OLD's | pgTAP 270: `relrowsecurity` true for all 6; per-role table privileges match the Step 2 list |
| R3 | A summit owner can't see CW data | pgTAP 270: a JWT whose email is in `summit.admins` but has no CW membership reads 0 rows from `cwr.inbox_messages`, `cwr.memberships`, `cwr.audit_log`, and unpublished `cwr.listings` |
| R4 | CW users and anon can't see summit data | pgTAP 270: a CW-member JWT whose email isn't in `summit.admins` gets `summit.is_admin() = false` and 0 rows from all 6 tables. Anon is denied on all 6 tables and can execute only `get_unavailable_ranges`, matching OLD's live grants (checked 2026-10-22: anon has `get_unavailable_ranges` only; authenticated has that plus `is_admin` and `generate_booking_reference`) |
| R5 | 623's database rules hold | pgTAP 270: overlapping confirmed bookings raise `bookings_no_confirmed_overlap`; `is_range_available` ignores an expired hold; anon is denied `booking_payments` and `bookings.total_amount` |
| R6 | Jobs isolated | pgTAP 270: `cron.job` has exactly `summit_purge_old_technical_data` and `summit_expire_stale_holds` matching `summit\_%`. Live after Step 8: every non-`summit_` job in `cron.job` (name and schedule) equals the Step 8 pre-step baseline. As read 2026-10-22, that is 8 jobs: 7 `cwr_*` plus `email-scheduled-dispatch`, which comes from the older app |
| R7 | The owner list is right | Live: `select email from summit.admins` = `onyxventuresnc@gmail.com` only |
| R8 | The 623 site works on CWR | Step 11 list: calendar loads; a test inquiry is saved and then deleted; a test booking's manage link opens; the console shows data after the owner signs in |
| R9 | Robot check on 623 sign-in and reset | Contract test: Turnstile present on the sign-in and reset forms, and `captcha_token` sent with the password grant and recover. Live: the owner signs in successfully with the widget (I don't type passwords) |
| R10 | Invite-only | Contract test: no `/auth/v1/signup`, no `signUpView`; an invite card is present; `type=invite` is handled. Local (Step 7): an invite email arrives in Mailpit, the link opens 623's choose-password view, and saving opens the console. Live (Step 11): the owner invites a second address of theirs and completes it |
| R11 | 623-branded emails for 623; CW emails unchanged | Local Mailpit (Step 5): a recovery or invite with `redirect_to` = the 623 local URL has 623 HTML, a 623 subject and a `/auth/v1/verify` link. A CW recovery is byte-identical to `cw-recovery-before.html` (tokens masked). Live (Step 11): one 623 reset email checked by the owner |
| R12 | 623 password rule matches CWR's | Contract test: admin.js requires lower, upper and digit plus length ≥ 8, with a mark for each |
| R13 | The CSP loosened only on the owner page | Contract test: the `/*` CSP still has `script-src 'self';`; the `/admin` block allows exactly `https://challenges.cloudflare.com` in `script-src` and `frame-src`. Pages preview (Step 10): `curl -sI <preview>/` shows the strict CSP, and `<preview>/admin` shows a single CSP with Turnstile |
| R14 | CW-Realty unaffected | Every Step 0 command shows the same results as the baseline, plus the new test file passing. CI on the CW PR is green. Live: CW sign-in by the owner works; CW public pages return 200 |
| R15 | OLD retired safely | Day 7: `select count(*)` per table on OLD where `created_at` > the switch time = 0 (anything found is reported to the owner, not copied automatically). Then OLD is paused with the owner's OK |

## Task breakdown
Steps 0–7 touch only repos and local machines. Steps 8–12 touch live systems; each starts only after the owner OKs that step.

**Step 0 — Baselines (no changes).**
- CW worktree: `npm ci`, then `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:check`, `npm run db:catalog`, `npm run db:start`, `npm run db:lint`, `npm run db:test`. Record the results.
- Playwright e2e and Lighthouse: record the latest CI result on `build1` (`gh run list --branch build1 --workflow ci.yml --limit 1`) as their baseline. They run again on the PR.
- 623, on a new branch: `cd supabase && deno task test && deno task check`; expect 56 passed.
- **Local hook override** (used in Steps 0, 5 and 7, never committed):
  - set `enabled = false` under `[auth.hook.send_email]` in CW `supabase/config.toml`, then `supabase stop && npm run db:start`
  - this matches live, where the hook is off
  - afterwards restore `enabled = true`, restart, and confirm `git diff supabase/config.toml` shows only Step 4's changes
- With the hook off, trigger a CW recovery for a seeded local admin in Mailpit and save it to the scratchpad as `cw-recovery-before.html`.
- A red baseline is reported to the owner before going on.

**Step 1 — Gap test first.** Write CW `supabase/tests/database/270-summit-isolation.test.sql` covering R2–R6 before the migration exists.
- Its own helper inside the file, `summit_test_claims(p_sub uuid, p_email text)`, sets `request.jwt.claims` with `sub`, `email`, `role` and `aal`, since `cwr_test.sign_in` has no email. `000-setup-helpers` is not modified.
- It reuses `cwr_test` fixtures for a CW member.
- Check: `npm run db:test`. File 270 fails because `summit` doesn't exist yet, and every other file matches baseline.

**Step 2 — The migration.**
- In a scratch copy of 623: `supabase start`, `supabase db reset`, then `pg_dump --schema-only --schema=public --no-owner "postgresql://postgres:postgres@127.0.0.1:54322/postgres" > scratchpad/summit-source.sql`. This keeps GRANT/REVOKE.
- Confirm repo = live: compare `md5(prosrc)` of the 9 functions and every `pg_get_constraintdef`/`pg_get_indexdef` between local and OLD. Any mismatch stops the plan and is reported.
- Write CW `supabase/migrations/20261023000100_summit_schema.sql` by hand from the dump:
  - `create extension if not exists citext with schema extensions;` and the same for `btree_gist`.
  - `create schema summit;` and `grant usage on schema summit to anon, authenticated, service_role;`
  - every object moved from `public.` to `summit.`, and every function body and `search_path` read and edited by hand.
  - `enable row level security` stated on all 6 tables.
  - grants and `revoke … from public` exactly as the dump.
  - omitted: `rls_auto_enable` and `ensure_rls`, since they would fire on every CWR `create table`.
  - cron: `select cron.schedule('summit_purge_old_technical_data','17 4 * * *','select summit.purge_old_technical_data()');` and `select cron.schedule('summit_expire_stale_holds','*/15 * * * *','select summit.expire_stale_holds()');`
  - a header comment: separate site, separate schema; nothing in `cwr` references `summit` and vice versa.
  - **no** admin row. Owner emails stay out of the repo.
  - no `public.` in any SQL statement, so `db:check` passes (the checker ignores comments). `revoke … from public` (no dot) is allowed.
- `scripts/check-migrations.mjs` line 26: change `(?!cwr_)` to `(?!cwr_|summit_)` so the rollback migration can unschedule the jobs this build now owns. Update its header comment to match.
- Check: `npm run db:test` passes, with 270 now green and the others unchanged. `npm run db:check` passes. `supabase db lint --local --schema summit --level warning` reports no warnings.

**Step 3 — Parity query.** Scratchpad `summit-parity.sql` (read-only) lists, for one schema:
- tables and columns
- function signatures with `md5(replace(prosrc,'summit.','public.'))`
- constraints and indexes
- table and function grants
- cron jobs

Check: run it on the local CWR stack (`summit`) and on OLD (`public`). The diff is empty apart from the schema name, the omitted trigger and the cron names.

**Step 4 — CW config, templates and docs.**
- `supabase/config.toml`: `schemas = ["public","graphql_public","cwr","summit"]`. Append `"http://localhost:8623/admin"` to `additional_redirect_urls`.
- `supabase/templates/recovery.html` and `invite.html`: `{{ if eq .RedirectTo "https://623summit.pages.dev/admin" "https://623summit.pages.dev/admin.html" "http://localhost:8623/admin" }}…623 version…{{ else }}…current file, byte-identical…{{ end }}`.
  - The 623 version uses 623 tokens (`#2C4358` header, `#A88452` button, `#FDFBF7` page, from 623 CLAUDE.md), a text wordmark "623 Summit Avenue" (no image to host), `{{ .ConfirmationURL }}`, and the same expiry wording as each CW file: recovery "one hour", invite "24 hours".
- Local addresses: the CW stack API is `http://127.0.0.1:55321` (CW `config.toml` port), and Mailpit is at the inbucket port in the same file.
- The recovery and invite subjects in `config.toml` use the same `if`/`else`; the `else` text is the current subject unchanged.
- New `docs/runbooks/summit-shared-database.md`: the owner steps, switch-over, day 7, rollback, the down script, how to invite and remove a 623 owner, and the reserved function names `submit-form`, `manage-booking`, `summit-invite-owner`.
- `docs/runbooks/email-outbox.md`: before "hook on", add: "First make `cwr.handle_auth_email` send 623 Summit emails (redirect_to on 623summit.pages.dev) with 623 branding and a `/auth/v1/verify` link, or 623 resets and invites break."
- Check: Step 5.

**Step 5 — Local email proof** (CW local stack, Mailpit, with the Step 0 local hook override on).
- (a) `POST /auth/v1/recover?redirect_to=http://localhost:8623/admin` with a captcha test token → 623 HTML and subject; the link is `/auth/v1/verify?…redirect_to=http://localhost:8623/admin`.
- (b) A CW recovery is byte-identical to the baseline (tokens masked).
- (c) `auth.admin.inviteUserByEmail(x,{redirectTo:'http://localhost:8623/admin'})` → the 623 invite.
- If subjects or `.RedirectTo` conditionals don't render (assumption A1), stop and ask the owner for a neutral shared subject.

**Step 6 — 623 code** (branch `claude/summit-shared-database`).
- `assets/js/api.js`:
  - URL → `https://egadvqpatnlkvgiiszzx.supabase.co`, key → CWR's publishable key (`get_publishable_keys`).
  - `rest()` adds `Accept-Profile: summit` on GET and `Content-Profile: summit` on POST/PATCH/DELETE.
  - `rpc()` adds `Content-Profile: summit`.
- `submit-form/index.ts` and `manage-booking/index.ts`: `createClient(…, { db: { schema: 'summit' }, auth: … })`. The env var becomes `SUMMIT_ALLOWED_ORIGIN`, because CWR secrets are project-wide and shared with `ai-chat` and the others.
- New `supabase/functions/summit-invite-owner/index.ts`, following `manage-booking`'s structure, with its own local `resolveAllowedOrigin` copy as manage-booking does:
  - POST only; requires `Authorization: Bearer <user JWT>`.
  - calls `rpc('is_admin')` with a client carrying the caller's JWT and schema `summit`; otherwise 403 `not_owner`.
  - validates the email (trimmed, ≤254 characters, one `@`, a dot in the domain).
  - inserts into `summit.admins` (`label` = "Invited by <caller email>", `on conflict do nothing`) with the service key.
  - calls `auth.admin.inviteUserByEmail(email, { redirectTo: SUMMIT_ORIGIN_FIRST + '/admin' })`, where the first entry of `SUMMIT_ALLOWED_ORIGIN` is the production origin.
  - if Auth says the email is already registered, returns `{ ok: true, existing: true }`.
- `supabase/config.toml`: `project_id = "egadvqpatnlkvgiiszzx"` and `[functions.summit-invite-owner] verify_jwt = true`.
- `supabase/deno.json`: add `functions/summit-invite-owner/index.ts` to the `check` task.
- `admin.html` / `assets/js/admin.js`:
  - remove `signUpView`, `signUpBtn`, `signUp()`, `signUpProblem()` and the `signUp*` marks.
  - add `<div class="cf-turnstile" data-sitekey="…">` to the sign-in and reset forms. The site key is CW's public key, copied from the `data-sitekey` on CW's live admin sign-in page. Load `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer>` on admin.html only.
  - the password grant and recover send `gotrue_meta_security: { captcha_token }`, then reset the widget. `captcha_failed` maps to "The robot check didn't go through. Please try again."
  - `takeRecoveryFromUrl()` also accepts `type=invite` and opens the password view titled "Choose your password".
  - the password marks are: 8+, lower, upper and digit (same wordless `.field-ok` pattern, each with a `.vis-hidden` label). `MIN_PASSWORD_LENGTH` stays at 8.
  - an "Invite an owner" card (email field plus button) appears only when signed in. It calls `summit-invite-owner` with the session token. The plain messages are "Invitation sent", "They already have a login and can sign in now", and "Couldn't send — try again".
  - the reset confirmation stays vague, unchanged.
- `_headers`:
  - the `/*` block keeps its CSP except `connect-src`, which becomes `'self' https://egadvqpatnlkvgiiszzx.supabase.co`.
  - new `/admin` and `/admin.html` blocks: `! Content-Security-Policy` (Cloudflare Pages detach syntax), then the same policy plus `script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com`.
- `site_contract_test.ts`:
  - the third-party test allows exactly `https://challenges.cloudflare.com` on `admin.html` only.
  - the 174 test keeps checking the first (`/*`) policy, and a new test checks the `/admin` block.
  - the ≈288 "scripts exist on disk" test skips `https://` sources. The third-party test still limits those to the one Turnstile URL.
  - the 318 lifecycle test drops `id="signUpView"` from its view list.
  - the sign-up tests (400-425) are replaced by the R9/R10 assertions.
  - the marks list is updated.
  - `jsTotal` is raised to just above the new total, with a comment saying why: the invite card and robot check, partly offset by removing sign-up.
- Bump `?v=` on all 5 pages.
- Delete `supabase/migrations/` and add `supabase/MIGRATIONS.md`: "Database lives in CW-Realty, schema `summit`. Never run `supabase db push` from this repo." The files stay in git history. This stops anyone re-creating `public.*` objects in CWR.
- `CLAUDE.md` and `README.md`:
  - database location and endpoint
  - invites replace sign-up
  - the robot-check exception on the owner page only
  - `SUMMIT_ALLOWED_ORIGIN`
  - remove the getawaysj testing note
  - "Add someone to the owner console" → use the invite card
- Check: `deno task test` (baseline tests minus the named sign-up tests, plus the new ones, all passing) and `deno task check` (3 functions).

**Step 7 — Local end-to-end.**
- Serve 623 on port 8623 (`python3 -m http.server 8623`) against the local CWR stack, with a temporary, uncommitted `api.js` URL/key edit. After the walk, revert it and confirm `git diff assets/js/api.js` shows only the Step 6 change.
- Functions: `supabase functions serve` attaches to the stack named by `project_id`, so serve from a scratch folder `scratchpad/summit-serve/`:
  - its `supabase/config.toml` holds only `project_id = "cw-realty"` and the three `[functions.*]` blocks
  - its `supabase/functions` is a copy of 623's three function folders
  - run `supabase functions serve --env-file scratchpad/summit-serve/.env`, where the `.env` sets `SUMMIT_ALLOWED_ORIGIN=http://localhost:8623`
- Keep the Step 0 local hook override on, so the invite reaches Mailpit through the template. Use the Turnstile always-pass test keys (`1x00000000000000000000AA` site key; CW `db:start` already sets the matching secret).
- Walk:
  - the calendar loads
  - a booking request is saved
  - its manage link opens
  - insert a local admin row, invite a second address, accept from Mailpit, set a password: the console opens and shows the booking
  - a CW-member JWT `GET /rest/v1/bookings` with `Accept-Profile: summit` returns `[]`
- Check: each item observed and noted in the PRs.

**Step 8 — Live database and settings (owner OK first).**
- (pre) Live baseline, read-only on CWR: save `select jobname, schedule from cron.job order by 1` and `select count(*) from pg_namespace where nspname = 'summit'` (expect 0) to the scratchpad as `cwr-live-before.txt`.
- (a) Open the CW PR to `build1`. CI must be green and the owner reviews; merge only when the owner asks.
- (b) Apply `20261023000100_summit_schema.sql` to CWR with `apply_migration` (the same way as earlier production migrations), then confirm `list_migrations` shows it.
- (c) Insert the owner row: `insert into summit.admins (email, label) values ('onyxventuresnc@gmail.com','Owner')`.
- (d) Run the parity query on CWR vs OLD (R1). Check `cron.job` (R6), `get_advisors` security and performance (no new findings on `summit`), and R7.
- Owner, in the Supabase dashboard (CWR):
  - (e) Data API → Exposed schemas: add `summit`, keeping the current ones.
  - (f) Authentication → URL Configuration → Redirect URLs: add `https://623summit.pages.dev/admin` and `https://*.623summit.pages.dev/admin` (Pages previews).
- (g) Owner, in Cloudflare → Turnstile → CW's widget → Hostnames: add `623summit.pages.dev`.
- (h) `node scripts/push-auth-email-templates.mjs --dry-run` (the owner types the access token at its hidden prompt).
  - The diff may show only the recovery and invite content and subjects.
  - It prints "Sign-ups off: yes" and "Send Email hook: off", which confirms the sign-up half of A3 and that templates are what live sends.
  - Then apply (the script backs up first).
- (h2) Captcha half of A3: `curl -s -X POST https://egadvqpatnlkvgiiszzx.supabase.co/auth/v1/token?grant_type=password` with the publishable key and the made-up body `{"email":"nobody@invalid.test","password":"x"}`. It must return error code `captcha_failed`.
- (i) From 623: `supabase secrets set SUMMIT_ALLOWED_ORIGIN=https://623summit.pages.dev --project-ref egadvqpatnlkvgiiszzx`, then `supabase functions deploy submit-form manage-booking summit-invite-owner --project-ref egadvqpatnlkvgiiszzx`.
- Check: `list_edge_functions` on CWR shows the 4 existing plus the 3 new. An OPTIONS request with `Origin: https://623summit.pages.dev` returns that origin.

**Step 9 — Preview check.**
- Push the 623 branch; Cloudflare Pages builds a preview (`<hash>.623summit.pages.dev`).
- Temporarily set `SUMMIT_ALLOWED_ORIGIN=https://623summit.pages.dev,<preview origin>`.
- Check R13 headers with `curl -sI`. Load the preview `/admin`: the robot check renders, and the calendar on `/` loads.
- Afterwards, reset `SUMMIT_ALLOWED_ORIGIN` to production only.

**Step 10 — Switch.** The owner reviews the 623 PR and asks for the merge; the merge to `main` deploys. Check: the live `/assets/js/api.js?v=<new>` contains the CWR URL, and the live `/admin` CSP includes Turnstile. Record switch time T.

**Step 11 — Live verification.**
- Me:
  - the calendar loads
  - a test inquiry is sent, then deleted by SQL
  - a test booking is made and its manage link opens; the test booking is then deleted by SQL
  - the CW homepage and listings return 200
  - CW problem alerts show nothing new
  - Supabase logs show no 4xx/5xx spike on CWR auth or rest
- Owner:
  - signs in at `/admin` with the robot check and the CW password
  - requests a reset and sees a 623-branded email
  - invites a second address of theirs and completes it
  - signs in to CW admin as usual

**Step 12 — Day 7.**
- R15 count on OLD. Then, with the owner's OK, `pause_project jauwwpluqjeefokxolea`. The owner deletes it later.
- After the owner accepts the work, delete this plan file.

**Dependencies**: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8a–i → 9 → 10 → 11 → 12. Step 6's site key needs nothing live. Step 8i needs Step 6's code.

## Assumptions (each verified at a named step)
- A1. Supabase Auth renders Go-template `if`/`eq` with `.RedirectTo` in bodies and subjects (Step 5).
- A2. `/recover` without a `code_challenge` returns the session in the URL fragment on CWR, as on OLD (Step 5 local, Step 11 live).
- A3. CWR's live auth has captcha on and sign-up off (Step 8h and 8h2). The live password rule doesn't need verifying: 623's page enforces CWR's stricter rule itself, and if the server is stricter still, admin.js already maps `weak_password` to a plain message (line 1313).
- A4. Cloudflare Pages `_headers` `! Header` removes the `/*` CSP for `/admin` paths, leaving one policy (Step 9 `curl -sI`).
- A5. A Turnstile hostname entry also covers its subdomains, so previews work (Step 9). If not, the preview check uses Turnstile's test site key through the uncommitted edit from Step 7.
- A6. OLD's live schema equals the 623 repo migrations (Step 2 md5 compare).

## DO NOT TOUCH
- CWR schemas `cwr`, `cwr_private`, `public`; buckets `owner-context`, `cwr-media`, `cwr-files`; cron jobs `cwr_*` and `email-scheduled-dispatch`.
- CWR functions `builtfor-screenshots`, `builtfor-test-img`, `generate-invoice-pdf`, `ai-chat`; repo `supabase/functions/email-worker`.
- CW `src/`, `app/`, `middleware.ts`, `worker.ts`, `wrangler.jsonc`, `docs/constitution/*`, `supabase/tests/database/000-setup-helpers.test.sql`, and every template except recovery and invite (whose CW branch stays byte-identical).
- CWR auth settings except the redirect URLs and the two templates and subjects.
- 623 booking rules (`validation.ts`, CHECK constraints, `MAX_ADVANCE_DAYS`, `HOLD_HOURS`, `CHANGEABLE`), money handling, `datepicker.js`, design tokens, `main.js`, `manage.js`.
- OLD: read only, until it is paused at Step 12.

## Regression safeguards
**Protected behaviors**
- CW:
  - admin sign-in with the robot check
  - CW reset and invite emails, content and subject
  - all `cwr` RLS
  - the job watcher (only `cwr_` jobs)
  - public pages
  - the `cwr` API
  - existing CI checks
- 623, documented:
  - 48-hour holds and expiry
  - the no-overlap constraint and its plain-words error
  - `is_range_available` as the single source
  - guest date moves revert to pending
  - money owner-only
  - token-only guest access
  - the vague reset message
  - sign-out revokes at Supabase
  - the recovery fragment is stripped
  - owner-entered bookings obey the rules
  - type floors and sentence case
  - the date picker
- 623, relied on but undocumented:
  - the `SUM-XXXXX` reference format
  - the per-IP rate limits on forms and lookups
  - the `is_admin` gate after every sign-in path
  - the strict CSP on public pages
  - the public script budget (`jsPublic`) unchanged

**Commands**
- CW: `npm run lint && npm run typecheck && npm test && npm run db:check && npm run db:catalog && npm run db:lint && npm run db:test`, plus CI's e2e and Lighthouse on the PR.
- 623: `cd supabase && deno task test && deno task check`.

**Baseline and compare**: Step 0 records; each step's check compares against it.

**Gap tests first**: pgTAP 270 is written in Step 1, before the migration (red, then green). The CW email byte capture happens in Step 0, before any template edit. The new 623 contract assertions are written before the admin.js edits in Step 6.

**Stop rule**: a test that passed at baseline and fails later stops work until it is fixed or the owner accepts it. The 623 sign-up tests are removed on purpose (decision 2) and listed by name in the PR.

## Downstream impact analysis
### Level 1 — Direct
- CW files:
  - `supabase/migrations/20261023000100_summit_schema.sql` (new)
  - `supabase/tests/database/270-summit-isolation.test.sql` (new)
  - `supabase/config.toml`
  - `supabase/templates/recovery.html`
  - `supabase/templates/invite.html`
  - `docs/runbooks/summit-shared-database.md` (new)
  - `docs/runbooks/email-outbox.md`
  - `scripts/check-migrations.mjs` (one regex allowance)
- 623 files:
  - `assets/js/api.js`, `assets/js/admin.js`, `admin.html`
  - 4 other pages (`?v=` only)
  - `_headers`
  - `supabase/config.toml`, `supabase/deno.json`
  - `functions/submit-form/index.ts`, `functions/manage-booking/index.ts`, `functions/summit-invite-owner/index.ts` (new)
  - `supabase/tests/site_contract_test.ts`
  - `supabase/migrations/` (removed), `supabase/MIGRATIONS.md` (new)
  - `CLAUDE.md`, `README.md`
- Contracts: the `summit` REST/RPC surface; the recovery and invite templates and subjects; 623 calls now carry profile headers; the function secret name.

### Level 2 — Dependent
- CW CI (`ci.yml`): runs the new pgTAP file and `db:lint` on `cwr`. Risk: low; checked on the PR.
- CWR live Auth (shared): templates, redirect list and captcha now serve both sites. Risk: **requires human approval** (security).
- PostgREST exposed schemas: adding `summit` reloads the schema cache, with no change to `cwr` or `public`. Risk: low.
- `cwr.check_scheduled_job_runs`: ignores `summit_*`. Risk: none (line 861).
- CWR advisors: new objects are linted. Risk: low (Step 8d).
- The Auth email rate limit is project-wide, so 623 and CW share it. Risk: low; volume is tiny, and it's noted in the runbook.
- 623 contract budget `jsTotal`: raised deliberately, while `jsPublic` is unchanged. Risk: low.
- `scripts/check-migrations.mjs` (CI `db:check`): the new migration must avoid `public.`, and the `summit_` unschedule allowance is added. Risk: low; it runs on the PR.
- CW constitution 02 §Emails: the shared templates now carry a 623 branch. Risk: **requires human approval** (an exception to an owner rule; the CW branch is unchanged).
- CWR `auth.users`: invited 623 owners become rows in the shared login table, with no CW membership, so they get anon-level CW access only (R3). Risk: low; listed in the runbook.

### Level 3 — Cascading
- CW email-outbox step 3 (hook on) would bypass the templates and break 623 emails. Risk: **requires plan entry**. Covered by the Step 4 runbook warning; the fix belongs to the outbox rollout.
- Visitors with a cached old `api.js` (≤1 day) post to OLD, which is untouched and still accepts. Risk: low, because all OLD data is test data and the day-7 count catches anything real (reported, not lost).
- Future CW function names: `submit-form`, `manage-booking` and `summit-invite-owner` are reserved in the runbook. Risk: low.

## Human approval gate (in the Gate 4 report)
- Architectural: 623 shares the CWR database and login, in its own `summit` schema.
- Security:
  - 623 sign-in follows CWR Auth rules (robot check, invite-only, CW password rule).
  - a new service-key function that sends invites (owner-only by `is_admin`).
  - adding the 623 site to CWR's allowed redirect addresses.
- External: the Turnstile script on 623's owner page, a CSP exception on that page only.
- Owner rule exception: CW's email rule (constitution 02 §Emails) is read as covering CW's own emails. 623's reset and invite emails, sent through the shared login system, carry 623 branding (owner decision 3). The constitution is not edited.

## Risks, decisions and rollback
**Decisions**
- D1. **Own `summit` schema**, rather than CWR `public`. `public` already holds an unrelated app with permissive policies and is PostgREST's default.
- D2. **One migration from a local dump**, rather than replaying 623's 11 migrations. Replaying would create `public.*` objects and the `ensure_rls` trigger, which fires on every future CWR `create table`.
- D3. **Keep the `submit-form`/`manage-booking` names**, rather than adding a `summit-` prefix. There's no collision, renaming churns test imports and URLs, and the runbook reserves the names.
- D4. **Secret `SUMMIT_ALLOWED_ORIGIN`**, rather than reusing `ALLOWED_ORIGIN`. Secrets are project-wide.
- D5. **Invite from the 623 console**, rather than the dashboard "Invite user". The dashboard can't set `redirect_to`, so the link would land on CW.
- D6. **Same Turnstile widget**, rather than a new one. Auth holds one captcha secret per project.
- D7. **A per-path CSP for `/admin`**, rather than loosening `/*`. Visitors' pages keep the strict policy.
- D8. **No data copy and no freeze**, rather than a copy-and-freeze window. Owner decision 4: all of it is test data.
- D9. **Apply the migration by hand with `apply_migration`**, rather than waiting for `deploy.yml`. Deploy only runs on `main`, which is not where this project merges.

**Top risks and mitigations**
- Templates don't render conditionals: proven locally (Step 5) before anything goes live; on failure, ask the owner.
- A missed object or rule drift: Step 2 md5 vs OLD, Step 3 parity, pgTAP R5.
- A 623 login reaching CW data, or the reverse: pgTAP R3/R4, plus the live policy audit (non-members get anon-level reads only).
- The `/admin` CSP not applying, or applying twice: Step 9 header check on the preview before the switch.
- Owner locked out of 623: invite, reset and sign-in proven locally (Step 7); OLD stays untouched for 7 days for an instant revert.
- A broken CW email: byte comparison (Step 5), dry run (Step 8h), backup with `--restore`.

**Rollback**
- Site: revert the 623 PR. The site points back to OLD, which is unchanged.
- Templates: `node scripts/push-auth-email-templates.mjs --restore <backup>`.
- 623 owner logins created by invites: they are CWR `auth.users` rows with no CW membership, so they can't reach CW data either way. The runbook lists them (`select email from auth.users where email in (select email from summit.admins)` minus CW members). The owner deletes them in Authentication → Users if wanted. I don't delete accounts.
- Order: the 623 site revert and the removal of `summit` from exposed schemas come first, then the database.
- Database: a forward migration from the runbook's down script, which passes `db:check` because of the `summit_` allowance:
  - `select cron.unschedule('summit_purge_old_technical_data'); select cron.unschedule('summit_expire_stale_holds'); drop schema summit cascade;`
  - leave `citext` and `btree_gist` installed (harmless)
- Owner settings: remove `summit` from exposed schemas and the 623 redirect URLs; remove the 623 hostname from Turnstile.
- Functions: `supabase functions delete submit-form manage-booking summit-invite-owner --project-ref egadvqpatnlkvgiiszzx`, and `supabase secrets unset SUMMIT_ALLOWED_ORIGIN`.

## Minimal footprint
Every change traces to R1–R15 or an owner decision. No CW app code changes. No 623 refactors beyond removing sign-up. No new libraries: Turnstile was decided by the owner, and supabase-js is already pinned. The 623 test-data cleanup (the getawaysj note) is limited to the docs that this change makes false.

## Approved deviation (owner, 2026-10-22, during implementation)
`supabase/templates/*.html` are generated from `supabase/functions/email-worker/templates.ts` (`npm run email:templates`), and `email-files.test.ts` fails if they drift or if a config subject differs from the generated one. So Step 4's 623 branch is built in the email-building code (`templates.ts` / `layout.ts` and their tests), not by hand-editing the HTML. `supabase/functions/email-worker` is therefore removed from DO NOT TOUCH for the recovery and invite templates only. Condition set by the owner: CW's own emails stay byte-identical, which the existing email tests plus the Step 0 Mailpit captures prove.
