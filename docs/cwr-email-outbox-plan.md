# CWR email outbox — plan

Status: rev 4, 2026-10-12 (rev 1: mostly B, two C — 16 changes; rev 2: six A, four B — 6 changes; rev 3: two changes; rev 4 ALL A). Plan only; nothing built. Waits for owner answers and an explicit "build it".

## Goal

Every Charlie Ward Realty email — sign-in emails (invite, reset, sign-in link, email change, verification code, account notices) and site emails (new request, visitor copy, reply, test alert, problem digest) — is built in code from one template file, `supabase/functions/email-worker/templates.ts`, queued in a database outbox, and sent through MailerSend by one `email-worker` function, usually within a second or two. Supabase's own mailer is never used; Supabase only makes the one-time links. A once-a-minute job picks up anything the instant wake-up misses.

## Today (validated 2026-10-12 against `build1` fb8aeb7 and the live project)

| Part | Today |
|---|---|
| Sign-in emails (14 Supabase action types, 13 templates) | Sent by Supabase's mailer from `supabase/templates/*.html` (hosted copies not yet pushed) |
| Site emails (5) | Site queues a small job on Cloudflare Queue `cwr-alerts`; `worker.ts` → `process-alert-job.ts` works out recipients, office contact, the 2-per-hour visitor-copy cap, builds each email (`messages.ts`) and sends through MailerSend |
| Delivery log | `cwr.alert_deliveries`: one row per email; status, claim, attempts, dedupe keys; admin Retry re-queues a job that rebuilds the email from source rows |
| Backup job | None; Cloudflare Queue retries 5×, then dead-letter queue |
| Problem digest | Paused (Cloudflare free plan has no Cron Trigger slot) |
| Live project add-ons | `pg_net` 0.19.5, `pg_cron` 1.6.4, `supabase_vault` installed; Send Email hook is on the Free plan |

## Architecture

```
Supabase Auth ──Send Email hook (Postgres fn)──┐
Site server code ──cwr.enqueue_email_job───────┼─► cwr.email_jobs (one row per event) ──AFTER INSERT──► pg_net POST ─┐
pg_cron */5 ──problem digest job (owner Q1)────┘                                                                  ▼
pg_cron * * * * * ──cwr.wake_email_worker (only if jobs are due) ─────────────────────────────────────────►  email-worker
                                                                         returns 202 at once, then in waitUntil:
                                                                         claim job → work out recipients (today's rules)
                                                                         → one cwr.alert_deliveries row per email (today's
                                                                         dedupe/claim) → fill template → MailerSend → finish
```

### 1. Two tables, each doing one job
- **`cwr.email_jobs` (the outbox, new):** one row per event — `tenant_id` (not null; RLS: editors read their tenant's jobs, nobody writes from the browser), `kind`, references (`thread_id`, `message_id`, `delivery_id`, `run_id`, `user_id`), non-secret auth details (`email`, `new_email`, `old_email`, `action_type`), `status` (`pending|working|done|failed|not_sent`), `attempts`, `next_attempt_at`, `expires_at` (sign-in jobs), `last_error`, `created_at`; index on `(status, next_attempt_at)`. No visitor text is stored here (the worker reads it from the inbox tables, as today), so nothing private reaches the audit log; the table has no audit trigger.
- **`cwr.alert_deliveries` (unchanged role):** one row per email sent, with today's dedupe keys, claim and Retry. Extended only for the new sign-in kinds.

### 2. Today's rules move with the code, not into SQL
The worker is a port of today's consumer: `process-alert-job.ts`, `deliveries.ts`, `problem-alerts.ts` and `dead-letters.ts` move into `supabase/functions/email-worker/` with their tests. Recipient fan-out, office contact, the visitor-copy cap, Retry rebuild from source rows (so failed rows made by the old Cloudflare path can still be retried) and the problem-digest claim/`finish_problem_alerts(outcome)` call all stay exactly as they are. `cwr.enqueue_email_job` only records the event.

### 3. One-time link values in a private schema
`token`, `token_hash`, `token_new`, `token_hash_new` go in `cwr_private.email_job_secrets` (job id → values). The `cwr_private` schema is not exposed through Supabase's Data API, so even the site's service-role key can't read it over the API; only `cwr.claim_email_job` (security definer) returns the values to the worker. Rows are deleted when the job finishes, expires, is superseded or is given up on; the minute job purges any leftovers. OWASP treats reset tokens as credentials; they are never logged, audited or put in problem records.

### 4. Sign-in producer (Send Email hook, Postgres function)
- `cwr.handle_auth_email(event jsonb)` inserts one job per recipient and returns `{}` — no network, well under the 2-second hook limit. On a database error it returns `{"error": {"http_code": 500, "message": "…"}}`; Supabase then shows the person an error (the site's sign-in pages already record those as problems). It does not try to write a problem record itself, because the hook runs inside Auth's transaction.
- All 14 action types are mapped: `signup`, `invite`, `magiclink` **and `email`** (both → the "sign-in links aren't used" template), `recovery`, `email_change`, `reauthentication`, and the 7 `*_notification` types.
- Email change with "confirm both addresses" makes two jobs: current address gets `token` + `token_hash_new`, new address gets `token_new` + `token_hash` (Supabase's reversed names), with a test for each.
- **Superseded links:** a new sign-in job marks older pending jobs for the same user and action `not_sent: superseded` (Supabase has already cancelled their links).
- `tenant_id`: sign-in jobs use the CWR tenant (`slug = 'cwr'`); an invited person may not have a membership yet.
- `expires_at` = now + the link lifetime minus 5 minutes. The lifetime lives in `cwr.email_settings.link_lifetime_seconds` (not null, seeded with 3600, the hosted default) and the owner script overwrites it with the hosted `mailer_otp_exp`.
- **Security definer, on purpose:** the hook, the insert trigger and `wake_email_worker` must write the private schema, read `vault.decrypted_secrets` and call `net.http_post`, which `supabase_auth_admin` can't. Each is `security definer`, owned by `postgres`, `search_path = ''`. Grants: `usage on schema cwr` and `execute on function cwr.handle_auth_email` to `supabase_auth_admin`; execute revoked from `public`, `anon`, `authenticated`.

### 5. Site producer — saved together with the thing it's about
- **New requests and replies queue their email in the same database transaction that saves them** (the outbox pattern's core rule): an `AFTER INSERT` trigger on `cwr.inbox_threads` adds a `new_request` job, and one on `cwr.inbox_messages` (kind `reply`) adds a `reply` job. A request can never be saved without its email job, whichever form or path created it, and the `runOnce` double-submit guard still means one thread → one job. Both triggers do nothing until the switch `cwr.email_settings.is_outbox_live` (default false) is turned on at rollout step 2, so nothing changes while the old Cloudflare path is still the live one.
- The site calls `cwr.enqueue_email_job` itself only for **test alerts and Retry**. The call returns `queued` when the database accepts it and `failed` with a problem reference when it doesn't. "Email isn't set up" is no longer decided from the site's own settings (the MailerSend key moves to Supabase); the Notifications page shows it from the worker's `not_sent: not set up` rows and its `health_checks` entry. The admin wording tests are updated to match.
- The site's producer code moves to `src/lib/email-outbox/enqueue.ts` and is kept at contract.
- One job per event, so a 10-recipient alert makes one wake-up, not ten.

### 6. Instant wake-up
An `AFTER INSERT` statement-level trigger on `cwr.email_jobs` calls `net.http_post(url, headers, body, timeout_milliseconds := 5000)` with the worker URL and shared secret from Vault. `pg_net` queues the request and sends it only after the transaction commits, so it never slows the insert or the hook.

### 7. email-worker (Supabase Edge Function)
- `[functions.email-worker] verify_jwt = false` in `config.toml`; instead it checks the shared secret (constant-time) and answers 401 otherwise.
- Answers **202 at once** and does the work in `EdgeRuntime.waitUntil` (well inside the 150-second Free limit), so pg_net's timeout never cuts it off.
- Claims due jobs with `FOR UPDATE SKIP LOCKED`; a claim goes stale after 10 minutes (today's rule). Backoff 1, 5, 15, 60, 360 minutes; after 5 tries the job is `failed`, recorded as a problem, and visible for Retry (site kinds only).
- Sign-in jobs past `expires_at` are marked `not_sent: expired` instead of sent.
- MailerSend: `settings: { track_clicks: false, track_opens: false }` on every send (tracking can't rewrite sign-in links); 429 honours `Retry-After`. MailerSend has no idempotency key, so delivery stays at-least-once, protected by the delivery claim (same as today).

### 8. Backup job and monitoring
- `pg_cron` every minute: `cwr.wake_email_worker()` posts only if jobs are due or a claim is stale; stamps `cwr.health_checks('email_sweep')`; records a problem when the oldest due job is more than 5 minutes old; purges expired secrets.
- `pg_cron` daily: delete `cron.job_run_details` older than 7 days (about 1,440 rows a day otherwise).
- The admin dashboard's existing "background check stopped" warning reads `email_sweep`. Moving the digest into the database removes today's outside watchdog of the database's own jobs; the dashboard warning (shown on every admin visit) is accepted as that check.

### 9. One template file
`supabase/functions/email-worker/templates.ts`, with `layout.ts`, `brand-colors.ts` and `site-constants.ts` beside it. Pure TypeScript, relative imports with `.ts` extensions (Deno requires them; Vitest accepts them), no `@/` imports. Holds all 18 emails (5 site + 13 sign-in templates). `REPLY_PROMISE` lives in `site-constants.ts`; a test fails if it differs from `src/lib/site/reply-promise.ts` (the site's forms still show it). Visitor text is escaped exactly as today; the wording snapshot, escaping, size and brand-token tests move with it.

### 10. Links and addresses
Invite and reset buttons go to our unchanged page `{site}/admin/auth/confirm?token_hash=…&type=invite|recovery`. `{site}` is the worker secret `EMAIL_SITE_URL`, checked against an allowlist (the workers.dev address before launch, `https://www.charliewardrealty.com` after). **Intended change:** the logo and the "Open it in the inbox" / admin links in site emails use the same address, so they work before launch (today they point at the old Wix site).

### 11. Local, CI and test sending
- `EMAIL_TRANSPORT`: `mailersend` (live), `mailpit` (local: Mailpit's HTTP send API at `http://supabase_inbucket_cw-realty:8025/api/v1/send` inside Docker; e2e reads it back through Mailpit's messages API), `log` (CI unit runs). The worker refuses anything but `mailersend` when `EMAIL_SITE_URL` is the live site.
- Local wake-up: `supabase/seed.sql` (already listed in `config.toml`, file not yet present) creates the Vault secrets with `vault.create_secret` — worker URL `http://supabase_kong_cw-realty:8000/functions/v1/email-worker` and a local-only test secret — so the trigger works in local runs and CI e2e. Worker secrets: git-ignored `supabase/functions/.env`, written from the committed `.env.example` (`EMAIL_TRANSPORT=mailpit`, same test secret) by `npm run db:start` and by the CI e2e job.
- Deno packages: `supabase/functions/email-worker/deno.json` maps `@supabase/supabase-js` to `npm:@supabase/supabase-js@<the version in package.json>`; a test fails if the two versions differ. ESLint declares the `Deno` and `EdgeRuntime` globals for that folder.
- `npm run db:start` stops excluding `edge-runtime`; the CI e2e job starts it.

## Owner questions

1. **Problem emails:** resume them with a 5-minute database job (no Cloudflare slot needed)? Recommended: yes — they've been paused since 2026-09-30. Who gets them stays the "Send problem emails" setting.
2. **Cutover order:** site emails first, then sign-in emails a few days later? Recommended: yes.
3. **Before cutover, push the branded Supabase templates** (existing script) so undoing the sign-in switch falls back to branded, not default, emails? Recommended: yes.

## Task breakdown

1. **Migration A0:** add the new `cwr.delivery_kind` values only (they can't be used in the same transaction they're added in; repo precedent `20260928000100`).
2. **Migration A:** `cwr.email_jobs`; `cwr_private` schema + `email_job_secrets`; `cwr.email_settings`; `cwr.enqueue_email_job`, `cwr.handle_auth_email`, `cwr.claim_email_job`, `cwr.finish_email_job`, `cwr.wake_email_worker`; statement-level insert trigger (inactive until the Vault secrets exist); `AFTER INSERT` job triggers on `inbox_threads` and `inbox_messages` (replies); delivery checks rewritten for sign-in kinds (`thread_id` required unless test/problem/sign-in; `job_run_id` = the job id for sign-in kinds) as `NOT VALID`, then `VALIDATE`; a partial unique index on `(job_run_id, lower(recipient_email))` for the sign-in kinds (dedupe guard, like test/problem); cron jobs (sweep, run-detail purge, digest per Q1); grants and RLS. pgTAP: each function, grants, the hook's `{}`/error replies, superseding, expiry, a request saved together with its job (and neither when one fails), no job made while `is_outbox_live` is false, the sign-in dedupe index, and a queued request in `net.http_request_queue` after an insert.
3. **email-worker:** `index.ts` (secret check, 202 + `waitUntil`, claim loop, finish), the ported job/delivery/digest modules, `templates.ts`, `layout.ts`, `brand-colors.ts`, `site-constants.ts`, `mailersend.ts`, `transports.ts`.
4. **Tests and CI:** Vitest include widened to `supabase/functions/**/*.test.ts`; CI quality job adds `denoland/setup-deno` with `deno check`, `deno lint`, `deno test` for the worker; `design:check` and ESLint cover the new path; the brand-color exception moves with `brand-colors.ts`.
5. **Site code:** `src/lib/forms/intake.ts` and the inbox reply action stop queueing (the triggers do it); test alert and Retry call `src/lib/email-outbox/enqueue.ts` → `cwr.enqueue_email_job`, returning `queued` or `failed` with a reference; "not set up" comes from the worker's rows and health check; Notifications log shows sign-in kinds (kind, recipient, status, time only) and blocks Retry for them ("Ask the person to request a new link"), as it already does for problem digests.
6. **`config.toml`:** `[auth.hook.send_email]` enabled with `uri = "pg-functions://postgres/cwr/handle_auth_email"`; `[functions.email-worker] verify_jwt = false`; edge runtime on.
7. **Owner script** (same safety pattern as the template push: hidden token, dry run, backup, read-back, `--restore`): reads `mailer_otp_exp` into `cwr.email_settings`; turns the hosted hook on/off; sets the 4 notice switches.
8. **Runbook** `docs/runbooks/email-outbox.md`: deploy order; secrets (`MAILERSEND_API_KEY`, `EMAIL_FROM`, `EMAIL_SITE_URL`, `EMAIL_WORKER_SECRET` in Supabase secrets, and worker URL + secret in Vault); **secret rotation** (new secret in Supabase secrets → Vault → wait one minute → remove old; the worker accepts current + previous during the swap); cutover checks; undo.
9. **Contract (after one clean week):** remove the Cloudflare queues and consumers (`worker.ts`, `wrangler.jsonc`), `src/lib/email/*`, `src/lib/jobs/*` (the producer already lives in `src/lib/email-outbox/enqueue.ts`, which is kept), `supabase/templates/`, and the Supabase template sections of `config.toml`.

## Rollout and undo

| Step | What | Undo |
|---|---|---|
| 0 | Push branded Supabase templates (Q3) | Script `--restore` |
| 1 | Migrations A0 + A; deploy email-worker + secrets; `is_outbox_live` false, wake-up and cron off | Nothing live changed |
| 2 | Set `is_outbox_live` true, turn on wake-up + cron; site emails switch to the outbox (site deploy). During the few minutes both paths could run, the delivery dedupe keys stop any email going out twice | Set `is_outbox_live` false and redeploy the previous site version (Cloudflare Queue path still present) |
| 3 | Owner script turns on the Send Email hook; test invite, reset, a notice | Script turns the hook off → Supabase mailer with branded templates |
| 4 | One clean week, then contract (task 9) | Revert the PR |

## Assumptions

- The project stays on a plan with the Send Email hook, `pg_net`, `pg_cron` and Edge Functions (all on Free today).
- MailerSend keeps the current sender domain and key; the key moves to Supabase secrets. MailerSend's API limit is 120 requests a minute, with a daily quota on its free tier — far above CWR's volume.
- Edge Function cold starts are usually under a second; "a second or two" is typical, not guaranteed.

## DO NOT TOUCH

Legacy Edge Functions in the live project (`builtfor-screenshots`, `builtfor-test-img`, `generate-invoice-pdf`, `ai-chat`); the `public` schema and its existing cron job; `app/admin/auth/confirm/route.ts`; sign-in, password and session code; chatbot code; inbox data tables — no column or data changes; only the two job triggers are added.

## Downstream impact analysis

### Level 1 — Direct
New: migrations A0 and A, `supabase/functions/email-worker/*`, owner script, runbook. Changed: `cwr.alert_deliveries` (checks and kinds), `config.toml`, `package.json` (`db:start`, Vitest include), CI, `vitest.config.ts`, `scripts/check-design-tokens.mjs` (exception path), `src/lib/jobs/enqueue-alert-job.ts`, `src/lib/admin/notifications/*`.

### Level 2 — Dependent
Supabase Auth email sending (all 14 action types); admin Notifications log and Retry; dashboard background-check warnings; problem log; design-token check.
Risk: requires human approval (architecture, external API, secrets).

### Level 3 — Cascading
Every invite and reset reaching people; the Cloudflare Worker bundle (consumers removed only at contract); Supabase Free quotas; MailerSend limits.
Risk: low with staged cutover and an undo per step.

## Edge cases (most → least critical)

| # | Edge case (cause → effect → deeper effect) |
|---|---|
| 1 | The hook errors or is slow → Supabase refuses the request → nobody can accept an invite or reset a password. |
| 2 | A stored one-time link value leaks → someone opens a reset link → they take over an admin account. |
| 3 | email-worker or MailerSend is down → sign-in emails wait → they'd arrive after their link expired. |
| 4 | Someone asks for a second reset → Supabase cancels the first link → the first email still goes out late with a dead link. |
| 5 | Turning on the hook with a broken setup → Supabase's mailer stops → no sign-in emails at all. |
| 6 | The worker is woken and the backup job runs at the same moment, or it crashes after sending → the same email goes out twice. |
| 7 | The wake-up takes longer than pg_net's timeout → the request is cut off → emails wait for the backup job. |
| 8 | Email change → Supabase's reversed field names → the wrong code goes to the wrong address. |
| 9 | The wake-up secret leaks → anyone can call the worker → wasted runs. |
| 10 | The once-a-minute job stops → missed wake-ups pile up → emails stall silently. |
| 11 | The rule for who gets alerts or the visitor-copy cap is lost in the move → wrong people emailed or a visitor spammed. |
| 12 | Retry on an old (Cloudflare-path) failure or on a sign-in email → nothing to rebuild from → Retry fails. |
| 13 | Visitor messages copied into the outbox → the audit log keeps them a year → privacy leak. |
| 14 | MailerSend click tracking → sign-in links rewritten → links break. |
| 15 | Hostile visitor text in a site email → phishing in CWR's name. |
| 16 | MailerSend rate limit (429) → sends refused → delays. |
| 17 | Local or CI runs → real emails to real people. |
| 18 | `cron.job_run_details` grows forever → database bloat. |
| 19 | Old Wix site still on the domain → logo and admin links in emails broken before launch. |
| 20 | Templates moved outside `src/` → tests and type checks silently stop running on them. |
| 21 | The request is saved but queueing its email fails → no job exists → the email is silently never sent. |
| 22 | The MailerSend key moves to Supabase → the site thinks email isn't set up → admins see wrong "not set up" messages. |

## Solutions (same numbering)

| # | Solution |
|---|---|
| 1 | The hook only inserts rows (no network); pgTAP proves its `{}` and error replies; Supabase shows a plain error and the sign-in pages record it. |
| 2 | Values live only in `cwr_private` (not reachable through the API), are returned only to the worker, deleted on finish, and never logged. |
| 3 | Backoff retries; sign-in emails past their link lifetime are marked "expired" instead of sent; failures and stale jobs show on the dashboard. |
| 4 | A new sign-in job marks older pending ones for the same person and action "superseded". |
| 5 | Step 3 is tested on the live project right away; the owner script turns the hook off in one command, falling back to branded Supabase templates (Q3). |
| 6 | Jobs and deliveries are claimed with `SKIP LOCKED`; finished ones are never re-claimed; claims go stale only after 10 minutes. |
| 7 | The worker answers 202 at once and works in the background; pg_net's timeout is set to 5 seconds. |
| 8 | Mapping follows Supabase's docs exactly, with a test for each address. |
| 9 | Constant-time secret check; the worker only processes jobs already due; a rotation procedure is in the runbook. |
| 10 | Heartbeat in `cwr.health_checks`; the dashboard warns; a problem is recorded when the oldest due job passes 5 minutes. |
| 11 | Today's consumer code and its tests move as they are; the worker resolves recipients from the same tables. |
| 12 | Retry re-queues a job that rebuilds from source rows (works for old rows); Retry is blocked for sign-in emails with a plain reason. |
| 13 | The outbox stores only references and non-secret auth details; it has no audit trigger. |
| 14 | Tracking is turned off on every MailerSend send. |
| 15 | Same escaping and tests, moved with the templates. |
| 16 | 429 honours `Retry-After`; small batches. |
| 17 | `EMAIL_TRANSPORT` is `mailpit` locally and `log` in CI; the worker refuses anything but MailerSend for the live address. |
| 18 | A daily cron job deletes run details older than 7 days. |
| 19 | Emails use `EMAIL_SITE_URL`, which points at the address that actually serves the new site. |
| 20 | Vitest include widened; CI runs `deno check`, `deno lint` and `deno test`; design check and ESLint cover the new folder; `deno.json` pins the same Supabase library version as the site (tested). |
| 21 | Requests and replies queue their email in the same database transaction (triggers), so one can't exist without the other. |
| 22 | "Not set up" is shown from the worker's own rows and health check, not the site's settings. |

## No-regression guarantees

- Same emails, wording and subjects (wording snapshot moves with the templates); invite and reset links point at the same page. One intended change: links and the logo use `EMAIL_SITE_URL`.
- Who gets each alert, the visitor-copy cap, dedupe and Retry behave as today (same code and tests, moved).
- Admin Notifications log and history stay in place throughout.
- Each step has its own undo; the Cloudflare Queue path is removed only after a clean week.
- Existing unit, pgTAP and e2e suites pass at every step.

## Sources

- Supabase Send Email hook: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
- Supabase Auth hooks (Postgres vs HTTP, timeouts, grants, Free plan): https://supabase.com/docs/guides/auth/auth-hooks
- Supabase pg_net: https://supabase.com/docs/guides/database/extensions/pg_net
- Supabase scheduling Edge Functions (Cron + pg_net + Vault): https://supabase.com/docs/guides/functions/schedule-functions
- Supabase Edge Function limits: https://supabase.com/docs/guides/functions/limits
- MailerSend API limits: https://developers.mailersend.com/general
- Transactional outbox pattern: https://microservices.io/patterns/data/transactional-outbox.html
- OWASP Forgot Password Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
