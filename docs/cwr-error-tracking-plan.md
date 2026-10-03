# CWR Admin Error Tracking — Plan

Status: **decisions approved by owner 2026-09-27** (D1–D6, see Human Approval Gate), revision 9. **Built 2026-09-27 except the Problems page**, which the owner deferred ("defer the Problems page, while implementing the remaining elements"). Deferred with it: the page's list, search, group detail and "Mark resolved" UI, the `resolve_problem_group` function and the owners-only navigation entry. Until then, owners look problems up by reference with the SQL in `docs/runbooks/problem-alerts.md`. The dashboard card and the dead-man notices are built. **Problem emails paused 2026-09-30** (owner decision): the Cloudflare account's Workers Free plan has no free Cron Trigger, so the 5-minute sender is unscheduled until one is available (`docs/runbooks/problem-alerts.md`).
Owner rule (2026-09-27): every problem a staff member or admin sees must be recorded, not only crashes.

## Goal

Every problem that an owner, manager or staff member hits in the admin portal or on the sign-in pages is recorded in one place with a reference code:
- database refusals
- file and upload failures
- browser failures
- failed page loads
- sign-in and access trouble
- background email and clean-up failures

The owner can look any of them up on a Problems page. The owner is emailed when something is broken, as opposed to a person simply typing something wrong.

## Governing rules

| Source | Rule this plan satisfies |
|---|---|
| Infra §3 Reliability | Fail gracefully with a clear message; mutations transactional and idempotent; jobs retry then dead-letter |
| Infra §4 Auditability | Every write records who, what, when; append-only logs; written retention enforced automatically; request ID end to end; status changes only through the Workflow Engine |
| Infra §5 | Paginate every list |
| Infra §7 Observability | Monitor errors from real user data; alert on symptoms users feel; blameless review with follow-up; runbook per critical system |
| Admin §1 / §7 | Errors stay until dismissed and say what to fix; every change logged with who and when |
| Build plan | Workers Observability, **no Sentry** (owner decision); MailerSend; Cloudflare Queues; hosted DB changes only through `supabase db push`; merged migrations immutable |

## Current state (verified 2026-09-27 against `c5bb96e`; `build1` is 2 commits ahead with status dots only, none in scope)

### Counts
- 67 exported admin server actions: 58 wrapped by `runAdminAction` / `runQuickAction` (56 call sites, two through shared helpers `moveItem` and `setDeletedAt`), and 9 unwrapped (6 in `auth-actions.ts`, plus `sendTestChatAction`, `requestPhotoUploadAction` and `requestHomeworkUploadAction`).
- 4 route handlers (`auth/confirm`, `logout`, `keep-alive`, `closed-deals/download/[platform]`).
- 3 browser pipelines (photo prepare and upload, Homework XHR upload, idle timer).
- 1 GitHub Actions nightly job (`cleanup-photo-files.yml`).

### What is recorded today
- **Crashes only.** An unexpected throw inside the two wrappers goes to `console.error` with no request ID or actor. Workers Observability keeps it for a few days, and the owner can't search it.
- **No database table stores application errors.** `cwr.audit_log` holds successful writes only. `cwr.alert_deliveries` holds email outcomes only.

### Silent or misleading failures
- **Database refusals:** 53 `getDatabaseErrorMessage` calls in 13 action files turn a refusal into a friendly message and discard the cause.
- **Page loads:** every admin query in `src/lib/admin/*/queries.ts`, `dashboard.ts` and `layout.tsx` ignores `error`, so a failure looks like an empty list, zero or "not found".
  - On Contact & footer and Tracking, a failed load shows a blank form. Saving it overwrites the real settings.
  - `fetchAdminUsers` ignores a `listUsers` error and shows "(unknown email)" with sign-in codes marked not set up. That is a misleading security status (`users/queries.ts:21,31`).
- **Browser failures are never reported:** photo prepare and upload, Homework upload, a rejected server-action call (network drop, or a deploy making the page stale), and keep-alive pings.
  - A Homework XHR abort never settles, so the screen stays on "Uploading…".
  - The live test chat can stay stuck on "sending".
- **Error screens:** `app/admin/(portal)/error.tsx` discards `error` and `digest`. `(auth)` has no error boundary, there is no `global-error.tsx`, and there is no `instrumentation.ts`.
- **Sign-in and access:**
  - Every sign-in error except 429 and captcha is shown as "email and password don't match", including an Auth outage.
  - Password-reset failures are ignored.
  - `listFactors` errors are ignored (`require-admin.ts:33`, `auth-actions.ts:25,45`), so an outage sends people to authenticator setup.
  - Middleware treats a `getClaims` failure as signed-out (`session-middleware.ts:51`), so an Auth outage silently logs everyone out.
- **Wrong behaviour found during this audit.** Each hides an error and gets fixed:
  1. **`savePolicyDraftAction`:** an update error is swallowed and a new version is created (`chat-policy/actions.ts:25-28`).
  2. **`removeAccessAction`:** no 0-row check (`users/actions.ts:80-89`).
  3. **Captions:** a storage download error is reported as "not a captions file" and the upload is deleted (`homework/file-storage.ts:51-52`).
  4. **`fetchStoredFileInfo`:** a list error is reported as "didn't finish uploading" (`file-storage.ts:42`). The photo equivalent is `hasAllPhotoFiles`.
  5. **`assignThreadAction`:** a transition failure after assignment leaves the thread half-changed (`inbox/actions.ts:42-47`).
  6. **`resetSignInCodesAction`:** can finish only partly, ignores the membership read error (`:94`), and hides the cause.
  7. **`inviteUserAction`:** discards the Auth error.
  8. **`runPolicyTestsAction`** (now `startPolicyTestRunAction`): a test-question load error says "Add at least one test question first".
  9. **`restorePolicyVersionAction` and `requestPhotoUploadAction`:** read errors say "no longer exists" or "couldn't be found" (`chat-policy/actions.ts:55`, `photos/actions.ts:30`).
  10. **`sendReplyAction`:** shows "Reply sent" even when the email could not be queued or sent.
  11. **`deleteForeverAction`:** pre-read errors orphan files without a record.
  12. **Closed deals export:** a query error produces an empty CSV.
  13. **`recordDeadLetter`:** ignores its own update error (`dead-letters.ts:12-15`).
- **Scheduled jobs:**
  - pg_cron failures (4 `cwr_` jobs) are visible only in `cron.job_run_details`, and nothing reads it.
  - The GitHub nightly photo clean-up's failures and its "secrets missing" skip are visible only in GitHub.
  - A dropped alert job (`JobDataError`) leaves only a console line.
- **Setup and alerting:**
  - No owner alert for system problems.
  - No SLOs, runbooks or status page (build plan item 23).
  - Production is missing `SUPABASE_SERVICE_ROLE_KEY` (build plan open item 1). This plan's database recording depends on it (see Assumptions).

## Architecture

```
 server action / page / route / middleware-flag ─► reportProblem()  (Next, server-only)
 browser (upload, render, network, Turnstile) ───► POST /admin/problems/report ─► reportProblem()
 Worker queue + cron, GitHub clean-up script ────► recordProblem(db, event)  (framework-free)
                                                         │
     every path writes ONE structured console line first (Workers Observability / Actions log)
                                                         ▼
                         cwr.record_problem(p jsonb)  — service_role ONLY, SECURITY DEFINER
                         validates · scrubs · caps per origin bucket · idempotent insert
                                                         ▼
               cwr.problem_events (append-only)  ─►  cwr.problem_groups (one per fingerprint,
                                                    status open/resolved via Workflow Engine)
                                                         │ alert_pending
                                                         ▼
      Worker Cron Trigger */5 ─► claim_problem_alerts ─► digest email (existing deliverEmail, kind 'problem')
      pg_cron */15 ─► check_scheduled_jobs (pg_cron failures + stale heartbeats ─► critical events)
                                                         ▼
      Owner: /admin/problems (search by reference / request ID, resolve with note), dashboard card + dead-man notices
```

### Key decisions

| Decision | Choice | Why |
|---|---|---|
| Store | New `cwr` tables, not Sentry | Sentry declined; Observability retention is short and not owner-searchable; DB is backed up, audited and tenant-isolated |
| Who may write | **Only trusted server code, through `service_role`.** No grant to `authenticated`/`anon`. Browser reports go through a server route that verifies the session and forces `source='browser'` | Session clients can call exposed RPCs directly from the browser, so any grant to `authenticated` would let staff forge `critical` events and write content into owner emails |
| What is recorded | Every error a person sees; every silent failure made visible; every browser failure; every scheduled or background failure; setup gaps | Owner rule |
| Severity | `info` (the person can fix it: validation, duplicate, business rule, wrong MFA code, expired link, 404), `warning` (done but degraded; stale or tampered input; wrong role), `error` (system fault), `critical` (outage, setup missing, half-finished change, security spike, dead heartbeat) | Alert on symptoms users feel |
| When the write happens | `warning`+ are written **before** the response (awaited, 1.5 s timeout), so the reference shown is the stored row. `info` is deferred with `after()` | Traceable references; no latency on the success path, and error-path latency is acceptable |
| Request data | Request ID, actor, path and release are read eagerly, before any `after()`; the service client needs no cookies | Next forbids `cookies()`/`headers()` inside `after()` in Server Components |
| Never break the action | Every reporter call is try/catch; the console line is always written first; the reporter never reports its own failure (no loops) | Reliability |
| Reference | `CWR-XXX-XXX`: 6 Crockford base32 characters from the event id (30 bits; halved by the owner 2026-09-27); unique index; the database issues a fresh code on collision | Short enough to read out; still unique |
| Request ID | Middleware **always generates** it for `/admin/*` (stops trusting client values there); stored on every event; forwarded by the service client | Unforgeable end-to-end link (Infra §4) |
| Transactions | Recorded by the app after the failed call, never inside the failing DB transaction (a rollback would erase it) | Correctness |
| Status | Group status `open`/`resolved` goes through `cwr.transition` using a new `problem_status` workflow | Infra §4 Workflow Engine rule |
| Audit | `problem_groups` audited **only** when status or resolution note changes (filtered trigger); `problem_events` and `health_checks` are append-only or system-state and excluded from `record_audit`, like `audit_log` and `idempotency_keys` | Avoids one audit row per event, which would be kept 3 years against a 1-year retention |
| Reader | Owners only — **D2** | Least privilege, matches `audit_log` |
| Retention | Events 1 year; groups while events exist — **D3** | Written retention |
| Alert recipients | Chosen by the owner with the "Send problem emails" toggle on the Notifications page (owners only). No automatic fallback (D4 deferred to the owner's open items). Until someone is switched on, problems are still recorded and wait; the dashboard says "No one gets problem emails yet" | Stops a manager routing owner-only data; the owner decides who is emailed |

### Data model

Two new migrations, because Postgres refuses to use a new enum value in the same transaction that adds it (55P04), and `supabase db push` runs each file as one transaction.

**Migration A** — `…_cwr_problem_delivery_kind.sql`: `alter type cwr.delivery_kind add value 'problem';`

**Migration B** — `…_cwr_problem_tracking.sql`:

**`cwr.problem_events`** (append-only):
- `id uuid pk` (caller-generated), `tenant_id uuid not null` (no FK), `occurred_at timestamptz default now()`.
- `origin text check in ('server_member','server_signin','browser_member','browser_signin','job','database','github')`.
- `area text` (≤40), `action text` (≤80; must exist in `cwr.problem_catalog`, else stored as `unknown.unknown`).
- `stage text check in ('validate','rule','not_found','access','duplicate','database','storage','browser','network','external','load','auth','job','unexpected','setup')`.
- `severity text check in ('info','warning','error','critical')`, `code text` (≤64), `shown_message text` (≤300), `detail text` (≤2000, scrubbed; may hold up to 5 scrubbed stack frames).
- `fingerprint text not null` (32 hex of sha-256 `area|action|stage|code`).
- `reference text not null unique`, `request_id text` (≤128), `actor_id uuid`, `actor_role text`, `record_table text`, `record_id uuid`, `page_path text` (≤300, path only), `release text` (≤64).
- Indexes: `(tenant_id, occurred_at desc)`, `(tenant_id, fingerprint, occurred_at desc)`, `(tenant_id, actor_id, occurred_at desc)`, `(tenant_id, origin, occurred_at desc)`, `(request_id)`, and partial `(digest) where digest is not null`.
- A `digest text` (≤64) column holds the Next.js error digest, so a server render crash and the browser's report of it share one row.
- Append-only guard trigger: same logic as `cwr.prevent_audit_change`, with a `cwr.retention_purge` bypass.

**`cwr.problem_catalog`** (`action text pk, area text, label text, section_label text, spike_codes text[] default '{}'`):
- Seeded by the migration with every catalog action. Later additions come in new migrations.
- A CI check against the live local DB asserts it matches `src/lib/observability/problem-catalog.ts` (see Enforcement).
- It has no `tenant_id` (global reference data). That means **no `record_audit` trigger**, which would fail on its not-null `tenant_id`, so it is added to the 010 exclusion list. It only changes through migrations.
- RLS: `select to authenticated using (exists (select 1 from cwr.owner_tenant_ids()))`.
- `spike_codes` lists the codes whose volume signals trouble even at `info`: `auth.sign_in` → `{invalid_credentials}`, `auth.verify_code` → `{mfa_verification_failed}`. Only these pairs can spike. `captcha_failed` and 429 never spike, because those attempts never reached Auth.
- Digest emails use **only** labels from here, never free text.

**`cwr.problem_groups`**:
- `id uuid pk`, `tenant_id`, `fingerprint`, unique `(tenant_id, fingerprint)`.
- `area, action, stage, code, max_severity`.
- `status text check in ('open','resolved') default 'open'`.
- `first_seen_at, last_seen_at, total_count, suppressed_count`.
- `alert_pending bool, last_alerted_at, last_alerted_severity, reopened_at, resolved_by, resolution_note (≤1000)`.
- Indexes: `(tenant_id, last_seen_at desc)`, partial `(tenant_id) where alert_pending`.
- `record_audit` trigger is `after insert or delete`, plus `after update … when (old.status is distinct from new.status or old.resolution_note is distinct from new.resolution_note)`. This satisfies the 010 trigger-exists guard.
- It gets the standard `cwr.guard_workflow_state('status','open')` trigger, so status can only change through `cwr.transition`.

**`cwr.problem_alert_runs`** (`id uuid pk, tenant_id, group_ids uuid[], severity_snapshot jsonb, status text check in ('open','sent','abandoned'), attempts int default 0, created_at, claimed_at`):
- One row is one digest. Its `id` is the `alert_deliveries.job_run_id`.
- A failed or `not_sent` run is re-claimed with the **same batch and id** until sent. Only then can a new run start.
- The dedupe index therefore never skips a recipient for groups they haven't seen.
- Excluded from `record_audit` (system state; each email is already in `alert_deliveries`, which is audited).

**`cwr.health_checks`** (`tenant_id, name, last_run_at, last_ok_at, last_error, last_runid bigint`):
- Names: `problem_alerts`, `scheduled_jobs`, `photo_cleanup`, `problem_log_writes`.
- Seeded with `last_run_at = now()` and the current max `runid`, so the first check does not backfill history.
- Excluded from `record_audit` (system state).

**Workflow:**
- Extend the `cwr.workflows.table_name` check (auto-named `workflows_table_name_check`, confirmed at Gate 3) to include `problem_groups`.
- Add `problem_status` to `cwr.install_default_workflows` for existing and new tenants. The 010 "four workflows" check becomes five.
- Transitions: `open→resolved` (owner), `resolved→open` (owner or service).
- **The role list is not the real control.** Both callers are definer functions (`current_user = postgres`), so `cwr.is_allowed_to_make` passes. The real control is the explicit `owner_tenant_ids()` check inside `resolve_problem_group`, and the service-only grant on `record_problem`. pgTAP tests both. The workflow still guarantees that every status change is logged as `transition` (Infra §4).

**`cwr.alert_deliveries`** (drop the unnamed checks by their generated names `alert_deliveries_check` / `alert_deliveries_check1`, and re-add them named):
- `alert_deliveries_thread_required: kind in ('test','problem') or thread_id is not null`.
- `alert_deliveries_run_id_required: (kind in ('test','problem')) = (job_run_id is not null)`.
- Widen the test dedupe unique index to `kind in ('test','problem')`.

**`cwr.notification_recipients`:**
- Add `gets_problem_alerts boolean not null default false`.
- A BEFORE INSERT/UPDATE/DELETE guard trigger raises 42501 unless the caller is an owner (`cwr.owner_tenant_ids()`) or the service context, in any of these cases:
  - the flag is set true or changes;
  - `email` changes on a row where the old flag is true;
  - a row with the flag true is deleted.
- Managers can't redirect owner-only digests through PostgREST directly. `restoreRecipientAction` (Undo) carries the flag. Restoring a flagged row goes through the same guard, so a manager's Undo of an owner-enabled row restores it with the flag off and says so.

**Functions** (all `SECURITY DEFINER`, `set search_path = ''`, `revoke execute … from public, anon, authenticated` explicitly, granted to `service_role` unless noted):

- **`cwr.record_problem(p jsonb) returns jsonb`** returns `{reference, stored: bool, suppressed: bool}`:
  - Normalises unknown enums and truncates text. It scrubs again (emails, phones, 6+ digit runs, tokens, `Key (…)=(…)`).
  - For `browser_signin`, severity is capped at `warning`.
  - **Flood cap per bucket, 60 s window:**
    - `*_member` events are counted per `actor_id` (30).
    - `server_signin` `info` events: 60. `browser_signin`: 30.
    - `job`, `database` and `github`: 120.
    - **Server-origin `error`/`critical` events have their own bucket of 300** and are never pushed out by `info` noise (for example bot `captcha_failed` posts).
  - **Over the cap:** no event row is inserted, but the group is **still upserted**: count, `suppressed_count`, `max_severity` and `alert_pending`. The first alert of a new outage is never lost, and the result is `{stored:false, suppressed:true}`.
  - **Insert** uses `on conflict (id) do nothing returning id`. If nothing was inserted (a retry), it returns the existing reference with no group change, which keeps the counts exact. A reference collision regenerates the reference once.
  - **Group upsert:** increments counts and raises `max_severity`. A `resolved` group is reopened through `cwr.transition` and `reopened_at` is set.
  - **`alert_pending = true` when either:**
    - severity ≥ `error`; or
    - the event's `code` is in its action's `spike_codes`, the origin is `server_*`, and the group has ≥20 events in the last 15 min.
  - It is always set, with no cooldown here. Query-string or browser input can never cause an email.
- **`cwr.claim_problem_alerts(p_limit int default 50)`:**
  - **If an open run exists** (not sent), it is re-claimed as is (same id, same batch) when not claimed in the last 10 min.
  - **Otherwise** it selects pending groups `for update skip locked` that meet any of these conditions:
    - `last_alerted_at is null`;
    - `last_alerted_at < now() - 1 hour`;
    - `reopened_at > last_alerted_at`;
    - `max_severity > last_alerted_severity` (an escalation skips the cooldown).
  - It creates a `problem_alert_runs` row with those groups and returns the run.
- **`cwr.finish_problem_alerts(p_run_id uuid, p_outcome text)`:**
  - `sent`: marks the run sent, and sets `last_alerted_at` and `last_alerted_severity` on its groups, clearing `alert_pending`.
  - The Worker computes the outcome per run: `sent` once every delivery is `sent` or has failed and cannot be retried (MailerSend 4xx); `failed` only while a retryable failure remains.
  - `failed`: keeps the run open for retry with the same id (recipients already sent are skipped by the dedupe index) and increments `attempts`.
  - A run where **no** delivery reached `sent` (for example every recipient refused because the MailerSend key was revoked, 401/403/422) is never `sent`. It becomes `abandoned` immediately: its groups stay pending, and a `critical` `setup` event "Problem emails are being refused" is recorded.
  - After an abandoned run, `claim_problem_alerts` waits `least(5 min × 2^n, 1 h)` (n = consecutive abandoned runs) before starting another. A refused key can't create delivery rows every 5 minutes.
  - After 6 attempts (about an hour) the run becomes `abandoned`. Its groups stay pending for the next run, a `critical` `setup` event "Problem emails keep failing" is recorded (no recipient stored), and a new run can start. One bad recipient can never block future alerts.
  - `not_sent` (email not configured): **deletes the run**, so the next run after email is set up uses a new id. The groups stay pending.
  - Every outcome is recorded in `health_checks('problem_alerts')`. `last_ok_at` is set **only** on a `sent` outcome, and `last_error` on anything else.
- **`cwr.resolve_problem_group(p_id uuid, p_note text)`** (deferred with the Problems page) is granted to `authenticated`. It checks owner via `owner_tenant_ids()` and calls `cwr.transition`.
- **`cwr.touch_heartbeat(p_name text)`** (service only) updates `last_run_at` **only** and never touches `last_ok_at` or `last_error`, so a heartbeat can't mask a failure.
- **`cwr.touch_health_check(p_name text, p_ok bool, p_error text)`** (service only) records an outcome. It always sets `last_run_at`; success also sets `last_ok_at`, and failure sets `last_error` and `last_error_at`.
  - `health_checks` gains a `last_error_at timestamptz` column.
  - The **start** of every Worker `scheduled()` run calls `touch_heartbeat('problem_alerts')`, not this function, so quiet days never look dead and a failing sender is never masked. Only `finish_problem_alerts` records the `problem_alerts` outcome.
  - Called by the GitHub clean-up (`photo_cleanup`).
  - Called by the app when `record_problem` fails but the service client still works (`problem_log_writes`).
  - Success updates `last_ok_at` at most once a minute (`where coalesce(last_ok_at, '-infinity') < now() - interval '1 minute'`), so there is no hot row.
  - `record_problem` itself refreshes `problem_log_writes.last_ok_at` on each stored insert from an **app origin** (`server_*`/`browser_*`; never `database`, `job` or `github`), with the same throttle and no extra round trip. The database's own "log isn't saving" event can't clear its own alarm. One transient failure therefore clears as soon as a write succeeds, instead of alerting forever.
- **`cwr.check_scheduled_jobs()`** (pg_cron):
  - Reads `cron.job_run_details` joined to `cron.job` for `jobname like 'cwr_%'` above a `runid` watermark (primary key, no full scan).
  - The watermark advances to `min(runid of rows still starting/running) - 1`, else the max. Unfinished runs are re-read until they end.
  - Each event id is a uuid v5 of `runid|status|kind`, so re-reading a run is idempotent through `on conflict (id)`.
  - It records a `critical` `database` event per `failed` run, and per run still `running` with `start_time < now() - 30 min`, with `return_message` (300 characters, scrubbed).
  - It records `critical` `setup` events when:
    - `problem_alerts` is older than 20 min;
    - `photo_cleanup.last_ok_at` is older than 36 h (null counts as old once the row is 36 h old);
    - for `problem_log_writes` or `problem_alerts`, `last_error_at > coalesce(last_ok_at, '-infinity')`, so a seeded row with no success yet still alarms. Each such condition also shows as a dashboard dead-man notice.
  - It updates its own `health_checks` row.
- **The Worker's `scheduled()` also checks `health_checks('scheduled_jobs').last_run_at`.** Older than 45 min means a `critical` event, which the same run emails. Each watchdog watches the other.
- **`cwr.purge_expired_problems()`** removes events older than 1 year, then groups with no events.
- **New pg_cron jobs:** `cwr_check_scheduled_jobs` (`*/15 * * * *`) and `cwr_purge_problems` (`50 3 * * *`).

**RLS:**
- `problem_events`, `problem_groups`, `problem_alert_runs` and `health_checks` are select-only for owners (`owner_tenant_ids()`).
- `problem_catalog` is readable by any owner (see its definition).
- There are no insert, update or delete grants to `authenticated` or `anon`.

### App layer

**New files:**

| File | Purpose |
|---|---|
| `src/lib/observability/problem-types.ts` | `ProblemStage`, `ProblemSeverity`, `ProblemOrigin`, `ProblemEvent` (client- and server-safe) |
| `src/lib/observability/problem-catalog.ts` | `PROBLEM_ACTIONS` const (every action in the Coverage table, with label and section) and the `ProblemAction` literal union type |
| `src/lib/observability/scrub.ts` | Pure scrubber (same rules as the DB) plus a stack trimmer (top 5 frames, our bundle paths only) |
| `src/lib/observability/reference.ts` | `getReference(id)` |
| `src/lib/observability/record-problem.ts` | **Framework-free** `recordProblem(db, event)`: console line, then RPC. Only relative imports (no `@/` alias, no Next). Used by `worker.ts`, middleware and jobs. Never throws. |
| `src/lib/observability/report-problem.ts` (server-only) | `reportProblem(event, { wait })`. Reads request ID, path, release and actor **eagerly**. Awaits `recordProblem` for `warning`+ (1.5 s timeout) and uses `after()` for `info`. If the service key is missing, it writes the console line only and returns `{ reference, stored: false }`. On an RPC failure it also calls `touch_health_check('problem_log_writes', false, …)` best-effort. A timeout returns `stored: 'unknown'`, because the write may still land. |
| Page load reporting | Each page collects its load failures and writes **one** awaited event per page (with every failed part in `detail`). A DB outage therefore adds at most 1.5 s once, not once per query. |
| `src/lib/observability/action-context.ts` (server-only) | `AsyncLocalStorage` holding `{ action, recordTable?, recordId?, cause? }`. `noteCause()` is a no-op outside a store. |
| `src/lib/observability/report-client-problem.ts` (client) | `fetch('/admin/problems/report', { keepalive })` with `sendBeacon` fallback. On failure, queues up to 20 events in `localStorage` (try/catch) **tagged with the signed-in user id** and flushes them on the next admin page load **only when the same user is signed in**; otherwise drops them. Skips events that already carry a server reference. |
| `app/admin/problems/report/route.ts` | POST: 8 KB cap, Zod, per-IP limiter `PROBLEM_REPORT_RATE_LIMITER` (20/60 s). **Verifies the session server-side** (`getClaims`, `aal1` accepted). With membership, origin is `browser_member` and the actor comes from the session. Without a session, only the sign-in URL allow-list (`/admin/login`, `/admin/forgot-password`, `/admin/mfa`, `/admin/mfa/setup`, `/admin/set-password`) is accepted as `browser_signin`. Forces `source` and caps severity itself.
- **`code` is mapped to a fixed list:** HTTP status class (`http_4xx`, `http_5xx`), `TypeError`, `AbortError`, `TimeoutError`, `ChunkLoadError`, `worker_error` or `other`. Nobody can mint unlimited groups.
- **Digest dedupe:** if the report carries a `digest` that the server already recorded, the route returns that row's reference instead of inserting a new one.
- Then it calls `reportProblem`. Added to `PUBLIC_ADMIN_PATHS` so middleware lets it through. Never reports its own failures. |
| `instrumentation.ts` | `onRequestError(error, request)` records render and route errors (`unexpected`/`error`) with digest and scrubbed stack. It reads path and request ID from its `request` argument (not `headers()`). The Gate 3 spike confirms OpenNext support; if unsupported, `error.tsx` reporting covers it. |
| `src/lib/admin/load-result.ts` + `src/components/admin/load-problem.tsx` | `LoadResult<T>` and the standard "This part didn't load. Refresh to try again. (Ref …)" block |
| `src/lib/admin/call-server-action.ts` (client) | Catches rejected action calls. A stale deploy (`UnrecognizedActionError` / "Failed to find Server Action") shows "The site was just updated. Refresh the page, then try again." A network `TypeError` shows "Connection problem. Check your internet and try again." Everything else shows a generic message. All are reported. |
| `src/lib/jobs/problem-alerts.ts` | `sendProblemAlerts(db, sender)` for the Worker cron |
| `app/admin/(portal)/problems/*`, `src/lib/admin/problems/*`, `src/components/admin/problems/*` | Problems page |
| `app/admin/(auth)/error.tsx`, `app/global-error.tsx` | Missing boundaries |
| `scripts/check-error-handling.mts` | CI guard using the TypeScript compiler API (see Enforcement) |

**Changes to existing files:**

1. **`run-admin-action.ts` / `run-quick-action.ts`:**
   - New first parameter `action: ProblemAction`. The shared helpers `moveItem`, `setDeletedAt` and the upload-ticket actions take a `ProblemAction` parameter.
   - The wrapper runs `work` inside `action-context` and reports **every** error result.
   - **Stage** comes from `cause`, else `validate` if there are field errors, else `rule`. Unexpected throw → `unexpected`/`error`. `AdminAccessError` → `access`/`warning`. `ZodError` in a quick action → `validate`/`warning`. `DuplicateSubmitError` → `duplicate`/`info` (now handled in `runQuickAction` too). Redirects are rethrown first and never reported.
   - `warning`+ messages gain ` (Ref CWR-…)` when `stored` is true. When the write timed out or failed, they gain ` (Ref CWR-… — may not be saved)`, and the console line still carries it.
   - The actor comes from `requireAdmin`. If `requireAdmin` itself fails, the actor is empty.
2. **`database-errors.ts`:**
   - Calls `noteCause('database', code, scrub(message))`.
   - For classification only (messages are unchanged), 42501 → `access`/`warning` takes precedence over own-rule pass-through; 23505 → `duplicate`/`info`; PGRST116 → `not_found`/`info`; 23514/22023/P0001/P0002 → `rule`/`info`; anything else → `database`/`error`.
   - It is imported only by `"use server"` files, which was verified.
3. **Storage, Auth-admin, Anthropic and queue helpers** call `noteCause` or, for partial success, `reportProblem`. The ad-hoc `console.error` calls in admin, jobs and worker code are replaced.
4. **Silent paths:**
   - Every admin query returns `LoadResult`. Pages render `LoadProblem`, and dashboard figures show "—".
   - Contact and Tracking do **not render the form** when the load fails.
   - `fetchAdminUsers` shows "Couldn't load sign-in status" instead of "not set up".
   - `requireAdmin` / `getMfaPath` / `getVerifiedFactorId`: a membership or `listFactors` error is reported as `critical` and shows "We couldn't check your access / sign-in codes right now. Try again in a moment", instead of redirecting.
   - "Not found" is shown only when the row truly is missing.
5. **The 13 wrong behaviours above are fixed.** Notable choices:
   - **Assign thread:** when the transition fails, the old assignee is restored and a `warning` is reported. If the restore also fails, a `critical` "half-finished change" is reported, naming the thread.
   - **Sign-in codes reset:** a partial reset is `critical` and the message says which step failed.
   - **Send reply:** `enqueueAlertJob` returns its outcome. The user sees "Reply saved. The email hasn't gone out yet — it will retry. Check Notifications (Ref …)".
6. **Auth:**
   - **Mapping:**
     - `invalid_credentials`, `captcha_failed`, 429, `same_password`, `weak_password`, MFA wrong code, expired link: `auth`/`info`, existing messages unchanged.
     - Changed 2026-10-02 (`docs/cwr-stale-quick-check-addendum.md`): a refused Quick Check says "The quick check didn't go through. Try again. If it happens again, tap Refresh page." and is recorded as `captcha_failed`, or `captcha_expired` when Cloudflare says `timeout-or-duplicate` (both `info`, never spike). A page built before the latest Quick Check key is recorded as `outdated_page` (`validate`/`warning`) and refreshes itself.
     - `insufficient_aal`: the existing redirect, `info`.
     - Any other Auth error or a thrown exception: `auth`/`critical`, shown as "Sign-in isn't working right now. Try again in a few minutes (Ref …)".
   - **Password reset** keeps its always-success screen (account-enumeration defence) and records failures. Exception (2026-10-02): a refused Quick Check shows the refusal message, since it reveals nothing about the account.
   - **No email address or code is ever stored.**
   - **Outage classifier** (`src/lib/observability/auth-outage.ts`, shared by middleware, `requireAdmin` and `getMfaPath`): an error counts as an **outage** only when `isAuthError(e)` **and** one of these holds: `isAuthRetryableFetchError(e)` (network status 0 or upstream 5xx), `e.name === 'AuthUnknownError'` (non-JSON upstream page), or `e.status >= 500`.
     - Any non-auth throw (for example a forged token with an unsupported algorithm) is **signed out**. It is recorded at most as `auth.session_check_invalid` at `warning`, which is never emailed and has no spike codes.
     - The Vitest table includes the forged-algorithm case.
     - Every other error (4xx, `AuthInvalidJwtError`, `AuthSessionMissingError`, revoked or reused refresh token) is **signed out, exactly as today**: cookies cleared, nothing recorded. A garbage cookie or a revoked session can never raise an alert.
     - A Vitest table test covers each auth-js error class.
   - **Middleware:** only a classified **outage** is handled in three steps:
     1. The middleware itself records `auth.session_check`/`critical` once, through `recordProblem` with the service client in `event.waitUntil`. It is keyed by the server-generated request ID, and nothing is taken from the URL or headers.
     2. It redirects to `/admin/login?reason=auth-unavailable`, which only chooses the wording "The sign-in service isn't responding. Try again in a few minutes". That query value is never recorded, so it can't be forged into an event.
     3. It **does not clear session cookies** on an outage (non-outage errors still clear them). This is a deliberate change listed under Level 2.
   - **Pages:** login notices (`no-access`, `link-expired`, `timeout`, `auth-unavailable`) come from query strings and are **not recorded**, because the event that caused them was already recorded where it happened. The `?notice=role` warning and admin 404 are recorded for signed-in members only (`server_member`, `info`, path only, no spike codes).
   - **Browser:** Turnstile widget load or render errors on the sign-in pages are reported as `browser_signin`/`warning`. The spike rule doesn't apply to them, so they can't trigger emails.
   - **Spike:** 20+ server-side failed sign-ins in 15 minutes trigger an alert (brute-force signal). Only `auth.sign_in`/`invalid_credentials` and `auth.verify_code`/wrong code can spike; bot posts without a Turnstile token (`captcha_failed`) cannot.
7. **Browser:**
   - **Upload hooks:** photo prepare and upload and Homework upload keep the worker's message and HTTP status. Homework gets `onabort`/`ontimeout` and a size-based `timeout` (minimum 2 min).
   - **Action calls:** `use-admin-form`, `quick-action-button`, `thread-composer`, `closed-deal-box` and `policy-test-chat` go through `callServerAction`. This fixes the stuck test chat.
   - **Idle timer:** reports after 3 consecutive keep-alive failures.
   - **`error.tsx` boundaries:** report the digest and show the reference.
   - **Frame listener:** one `window.onerror` / `unhandledrejection` listener in the admin frame. It reports `error` only when the top frame is our own `/_next/` bundle, otherwise `info`. It dedupes by fingerprint for the session (`sessionStorage`, try/catch).
8. **`middleware.ts` / `request-id.ts`:** for `/admin/*`, always generate the request ID. Public pages keep current behaviour. `getPageResponse` deletes any incoming header beginning `x-cwr-` before forwarding, so no internal header can be injected.
9. **`service-client.ts`:** accepts an optional request ID and forwards it as `x-request-id`.
10. **`worker.ts` / `wrangler.jsonc`:**
    - A `scheduled()` handler with `"triggers": { "crons": ["*/5 * * * *"] }` does three things in order:
      1. `touch_heartbeat('problem_alerts')` (heartbeat only).
      2. Checks the `scheduled_jobs` heartbeat age (critical if over 45 min).
      3. `sendProblemAlerts`.
      Each step is wrapped, so one failing never skips the others.
    - `queue()` `JobDataError` drops and `recordDeadLetter` failures call `recordProblem` via `ctx.waitUntil`.
    - Add bindings `PROBLEM_REPORT_RATE_LIMITER` (namespace 1003) and `version_metadata`.
11. **Delivery plumbing:**
    - `deliveries.ts` looks up `problem` rows by `job_run_id` and recipient.
    - `DeliveryKind` and the notifications query/labels include `problem`.
    - Retry is hidden for `problem` rows, because the cron re-sends open runs itself. A `not_sent` run is discarded and rebuilt with a new id once email works (see `finish_problem_alerts`).
    - `process-alert-job.ts` rejects a `retry` of a `problem` row as `JobDataError`.
12. **Problem digest (`src/lib/email/messages.ts`):**
    - Catalog labels, counts, first and last seen, severity, references and a link to `/admin/problems`.
    - **No free text, names or emails.**
    - `not_sent` (email not configured) leaves groups pending, and the dashboard shows a critical notice.
13. **Notifications page:**
    - A "Send problem emails" / "Stop problem emails" toggle, visible and usable by owners only (`OWNER_ROLES` action plus the DB guard).
    - Notices: "No one gets problem emails yet — switch someone on below"; "Email isn't set up — problem emails can't be sent".
    - With no one switched on, `sendProblemAlerts` only writes its heartbeat: no run is created, groups stay pending, and nothing is marked as alerted. The first digest after someone is switched on covers everything still pending. This is a known setup state, so it raises no critical.
14. **Dashboard (owners):**
    - "Problems — last 24 hours" card.
    - Dead-man notices for each stale `health_checks` row.
    - "The problem log isn't saving (service key missing)" when the service client is unavailable.
15. **Navigation:** "Problems" entry, owners only.
16. **GitHub clean-up** (`scripts/cleanup-photo-files.mjs`, `cleanup-photo-files.yml`):
    - The script stays plain `.mjs`. It calls `supabase.rpc('record_problem', …)` directly with a minimal payload (origin `github`, action `jobs.photo_cleanup`, stage `job`, severity `error`, `code` = error class) on failure, and `rpc('touch_health_check', …)` on success. Each call is wrapped so reporting can't fail the job.
    - The "secrets missing" skip is caught by the 36 h stale check.

### Problems page (owners only)

- **List:** problem groups, paginated 25 per page, newest first. Each row shows severity, section, action label, what the person saw (latest), count, first and last seen (America/New_York) and status.
- **Filters and search:** section, severity, open/resolved, 24 h / 7 d / 30 d / all. Search accepts a reference or request ID.
  - A reference that isn't stored shows "Not in the log — it was only written to the server log. Search Cloudflare Workers Observability for it within 7 days (see runbook)."
- **Group detail:** paginated occurrences with time, person (name and email via the existing Auth admin lookup used by Users), reference, page, and a record link when the record still exists.
- **Resolve:** "Mark resolved" with a note that feeds the blameless review.
- **States:** empty, loading and error states per Style §11. Accessible table.

### Enforcement

- **`scripts/check-error-handling.mts`** runs in CI (`quality` job; Node 24 runs `.mts` natively) using the TypeScript compiler API, already a dependency. It checks `src/lib/admin`, `app/admin`, `src/lib/jobs`, `src/lib/observability`, `worker.ts` and `middleware.ts`, excluding `*.test.ts`.
  - **The "unchecked result" rule is defined precisely:**
    - It targets an awaited expression whose type has an `error` property assignable to `PostgrestError | AuthError | StorageError | null`, including elements of `Promise.all` tuples and values returned from `.then` chains.
    - It is a **violation** when:
      - the result is discarded (an expression statement);
      - it is destructured without an `error` binding;
      - the `error` binding (or `result.error`) has no later reference in the same function.
    - It is **treated as read** when the whole result object is passed to a function or returned (for example `getCheckedData(result)`).
    - An inline `// error-ok: <reason>` comment on the line exempts deliberate ignores. The count of exemptions is printed.
    - Whether this rule works is decided by the Gate 3 spike, with a fixture file covering each case above and a run over today's tree. The expected findings are the known silent paths, and the false-positive target is zero.
  - **Catalog rule:** an exported async function in a `"use server"` file under `src/lib/admin`, or in `auth-actions.ts`, must be listed in `PROBLEM_ACTIONS[*].fn`; every catalog `fn` must exist; names must be unique.
- **TypeScript** enforces the wrapper's and helpers' `ProblemAction` parameter, so no literal-string checks are needed.
- **ESLint:** `no-console: error` for `src/lib/admin/**`, `src/components/admin/**`, `app/admin/**`, `src/lib/jobs/**` and `worker.ts`, allowed only in `record-problem.ts`.
- **Catalog parity against the database:** in the CI `database` job, after `supabase db start`, `scripts/check-problem-catalog.mts` diffs `select action from cwr.problem_catalog` against `PROBLEM_ACTIONS`. There is no SQL parsing, so it stays correct as later migrations add actions.
  - Known limitation: a preview Worker whose new actions are not yet migrated records them as `unknown.unknown`, with the real name kept in `detail`, until merge.

## Coverage: every admin action, today vs after

Key:
- **L** means console only, crash only.
- **S** means shown, not recorded.
- **—** means silent or misleading.
- **R** means recorded with a reference.
- **A** means it can email the owner (system fault, outage or spike).

| Section | Action | Today | After |
|---|---|---|---|
| Sign-in | Sign in | S; outage shown as wrong password | R, A (outage or 20+ failures) |
| Sign-in | Verify authenticator code | S; outage sends to setup | R, A |
| Sign-in | Start / confirm authenticator setup | S; cleanup errors silent | R, A |
| Sign-in | Request password reset | — | R (screen unchanged), A |
| Sign-in | Set new password (invite/reset) | S; cause masked | R, A |
| Sign-in | Open invite / reset link | — | R |
| Sign-in | Sign out, session time-out, keep-alive | — | R |
| Sign-in | Session check during sign-in service outage | — (silently signed out) | R, A |
| Sign-in | Bot check widget fails to load | — | R |
| Any page | Wrong-role notice, page not found | — | R |
| Any page | Page crashes | Generic screen, nothing recorded | R, reference on screen, A |
| Any page | Site updated mid-session / connection drop | Generic crash screen | R, clear message |
| Dashboard | View counts, unread badge, setup notice | — (shows 0) | R, shows "—", A |
| Listings | View list / open listing / preview | — | R, A |
| Listings | Create, edit details | S; L crash | R, A |
| Listings | Publish/unpublish, change status (+ Undo) | S; L crash | R, A |
| Listings | Move up/down | S; L crash | R, A |
| Listings | Add photo (prepare, upload, save) | S; browser steps unrecorded; link failure L | R every step, A |
| Listings | Edit alt text, move photo | S; L crash | R, A |
| Listings | Trash listing or photo (+ Undo) | S; L crash | R, A |
| Team | View list / open member | — | R, A |
| Team | Create, edit, show/hide, move | S; L crash | R, A |
| Team | Upload/replace/remove photo (+ Undo) | S; browser steps unrecorded | R, A |
| Team | Trash (+ Undo) | S; L crash | R, A |
| Connections | View list / open | — | R, A |
| Connections | Create, edit, show/hide, move | S; L crash | R, A |
| Connections | Upload/replace/remove photo (+ Undo) | S | R, A |
| Connections | Trash (+ Undo) | S; L crash | R, A |
| Homework | View list / open item | — | R, A |
| Homework | Create video / download item | S; L crash | R, A |
| Homework | Edit details, show/hide, move | S; load errors become "not found" | R, A |
| Homework | Upload / replace video or document | S; browser upload unrecorded; checks misreport; abort hangs | R every step, fixed, A |
| Homework | Upload / remove captions | S; download error misreported | R, fixed, A |
| Homework | Upload/replace/remove cover picture | S | R, A |
| Homework | Trash (+ Undo) | S; L crash | R, A |
| Inbox | View list / thread, filter | — | R, A |
| Inbox | Assign to teammate | S; can half-finish | R, fixed, A |
| Inbox | Add internal note | S | R, A |
| Inbox | Send email reply | "Sent" even when it failed; L | R, honest message, A |
| Inbox | Close / reopen (+ Undo) | S; L crash | R, A |
| Closed deals | View list | — | R, A |
| Closed deals | Record/correct, remove (+ Undo) | S; L crash | R, A |
| Closed deals | Download CSV for Google/Meta | L crash; query error gives empty file | R, error page with reference, A |
| Chats | View chat logs | — | R, A |
| Notifications | View recipients and email log | — | R, A |
| Notifications | Add, remove (+ Undo), pause/resume recipient | S; L crash | R, A |
| Notifications | Send test alert, retry delivery | Shows success; delivery log + L | R, A |
| Notifications | Problem alerts switch (new, owners) | n/a | R, A |
| Users | View users | — (outage shows codes "not set up") | R, fixed, A |
| Users | Invite user | S; cause discarded | R, A |
| Users | Change role, remove access (+ Undo) | S; 0-row delete says success | R, fixed, A |
| Users | Reset sign-in codes | S; partial reset hidden | R, partial = critical, A |
| Chat policy | View versions / tests | — | R, A |
| Chat policy | Save draft | Update error silently makes a new version | R, fixed, A |
| Chat policy | Restore version, publish | S; restore read error says "no longer exists" | R, fixed, A |
| Chat policy | Add/remove test question (+ Undo) | S; L crash | R, A |
| Chat policy | Run tests, live test chat | L model failures; wrong message; chat can hang | R, fixed, A |
| Tracking | View / save IDs, mark tags reviewed | S; failed load shows blank form | R, form blocked, A |
| Contact & footer | View / save settings | S; failed load shows blank form | R, form blocked, A |
| Trash | View, restore | S; L crash | R, A |
| Trash | Delete forever | S; file-cleanup failures L | R, A |
| Problems (new) | View, search, resolve | n/a | R, A |
| Background | Alert emails (new request, reply, test, retry, dead letter) | Delivery log + L; dead-letter write errors silent | R, A |
| Background | Problem alert sender (Worker cron) | n/a | Heartbeat, A via DB check |
| Database | Nightly clean-ups (trash, conversations, keys, audit, problems) | — | R, A |
| GitHub | Nightly photo-file clean-up (and its skip) | GitHub only | R, A |

## Edge cases, three levels deep

| Level 1 failure | Level 2: the handler fails | Level 3: that fallback fails | Final safety net |
|---|---|---|---|
| DB refuses a save | `record_problem` fails | Service client works: `touch_health_check('problem_log_writes', false)` marks health; the console line exists; the message shows "Ref … — not saved". Service key missing: dashboard "problem log isn't saving" notice | `check_scheduled_jobs` raises critical within 15 min; runbook points to Observability by reference |
| Browser upload fails | Report POST fails (offline) | `localStorage` queue unavailable (private mode): event dropped, but the person still sees the message | The server-side ticket or save step records its part; repeated failures surface as a spike on the server side |
| Page load fails | `reportProblem` inside a render throws | Wrapped: the page still renders `LoadProblem` | `instrumentation.ts` `onRequestError` / `error.tsx` digest |
| Error flood (render loop) | Bucket cap reached | Suppressed count still increments the group | The group shows "N more not stored"; the spike alert fires |
| Alert email fails | Next run re-sends the same run (same id, same batch; recipients already sent are skipped) | MailerSend down for hours: stays pending, `health_checks.last_error` is set | Dashboard critical notice; problems stay listed on the Problems page |
| Worker cron stops | `problem_alerts` heartbeat goes stale | `check_scheduled_jobs` raises a critical event, but emails can't go out (the sender is the broken part) | Dashboard dead-man notice; external uptime or heartbeat ping (D6, needs the status-page provider) |
| pg_cron stops entirely | No DB checks run | `scheduled_jobs` heartbeat stale | The Worker cron checks `scheduled_jobs` age and emails a critical alert (each watchdog watches the other) |
| Whole database down | No recording possible | The console line in Workers Observability still exists | Site-wide outage is caught by the external uptime monitor (D6) |
| Retry or duplicate report | Same event id | `on conflict (id)` with no group change | Counts stay exact |
| Forged or spam reports | Session verified; origin forced; severity capped; `code` mapped to a fixed list; IP limiter; bucket cap; internal `x-cwr-` headers stripped | Only server-side `(action, code)` spike pairs can spike; query strings and browser input can never cause an email | Digest uses catalog labels only, so no attacker text reaches email |
| Transaction rollback | Recording happens outside the failed transaction | n/a | n/a |
| Deploy skew (old page, new server) | Action id missing → refresh message | Report route itself is new → a queued event flushes after refresh | — |
| Migration not yet applied (preview or skipped deploy) | RPC missing → console only, "not saved" | Problems page shows "The problem log isn't set up yet" | Deploy runs `migrate` before `app` |

## Task breakdown (execution order)

1. **Gate 3 spikes** (throwaway branch, results recorded in this plan). Confirm each of:
   - `after()` and `AsyncLocalStorage` on OpenNext 1.20.6 / `nodejs_compat`.
   - `instrumentation.ts` `onRequestError` on OpenNext.
   - `scheduled()` alongside `queue()`.
   - `postgres` reads, and pgTAP can insert into, `cron.job_run_details` locally.
   - `cwr.transition` works for the service context from inside a definer function.
   - The generated names of the two `alert_deliveries` checks and of `workflows_table_name_check`.
   - Middleware can call `recordProblem` through `event.waitUntil` under OpenNext.
   - `uuid-ossp` is available in the `extensions` schema locally and in production. Definer functions (`search_path = ''`) call `extensions.uuid_generate_v5(...)` and the built-in `sha256()` fully qualified.
   - The `check-error-handling.mts` fixture run, with zero false positives on today's tree.
2. **Migrations A and B.** Then pgTAP `150-problem-tracking.test.sql`:
   - **Grants and access:** `authenticated`/`anon` can't execute `record_problem`. Only owners can read.
   - **Writing:** no direct writes. Idempotent retry leaves counts unchanged. Reference collision is handled.
   - **Caps:** each bucket's cap and the suppressed count. `browser_signin` severity cap and spike exclusion.
   - **Alerts:** pending, cooldown and reopen rules. Claim, skip-locked and stale takeover. Finish outcomes.
   - **Workflow:** resolve and reopen through the workflow, and audit rows only on status or note changes.
   - **Recipients:** the `gets_problem_alerts` owner guard.
   - **Scheduled jobs:** `check_scheduled_jobs` handles failed, long-running and stale heartbeats, and doesn't backfill on the first run.
   - **Retention:** the purge works, and delete is blocked otherwise.
   - Update `010` and `100`:
     - `010`: exclusions `problem_events`, `problem_catalog`, `problem_alert_runs`, `health_checks`; cron set +2; five workflows; grants.
     - `100`: the new named checks.
   - More tests:
     - The catalog seed inserts cleanly.
     - A suppressed first event still sets `alert_pending`.
     - Server `error` survives an `info` flood.
     - Escalation bypasses the cooldown.
     - The run lifecycle: `failed` re-sends the same id, `not_sent` rebuilds with a new id, and an `abandoned` run unblocks the queue.
     - `problem_log_writes` recovers after one successful write.
     - `captcha_failed` floods never spike.
     - Every recipient returning 401 leaves the groups pending, raises the "emails refused" critical and shows the notice.
     - The database's own events don't refresh `problem_log_writes`.
     - A heartbeat followed by a refused outcome still raises the alarm.
     - Abandoned-run backoff.
     - The first success on a seeded row with null `last_ok_at` sets it.
     - A successful photo clean-up clears the 36 h alarm.
     - A still-running pg_cron row is re-read and then recorded when it fails.
     - Recipient guard: a manager can't change the email of, or delete, a flagged row.
     - The status guard blocks a direct status update.
3. **Observability core**, with Vitest:
   - The scrubber cases.
   - `recordProblem` never throws.
   - `reportProblem`: eager reads, `warning`+ awaited, `info` deferred, no service key, RPC failure, and use from a Server Component.
   - Reference format.
   - Catalog equals the SQL seed.
4. **Wrappers, `database-errors.ts` and helper parameters.** Name all 58 wrapped actions and the 3 unwrapped admin actions. Vitest for both wrappers, covering every stage and severity mapping.
5. **Silent-path fixes and the 13 behaviour fixes.** Each gets a failing test first (Vitest or Playwright).
6. **Auth and middleware reporting**, with a Vitest table test over every Auth error code.
7. **Browser path:** the route (auth, allow-list, size, limiter, forced origin), `report-client-problem` (queue, user tag, flush, dedupe, storage throws), `call-server-action`, hooks, boundaries, frame listener, `instrumentation.ts`.
8. **Alerts:**
   - `problem-alerts.ts`, `worker.ts` `scheduled()`, the bindings, and the delivery plumbing.
   - The digest in `messages.ts`, checked for no free text.
   - Tests: partial-recipient success, `not_sent`, a second run doesn't double-send, no recipients switched on (groups stay pending, no run, no critical; the first digest after switching someone on includes them), the Worker checks `scheduled_jobs` age.
9. **Owner UI:** Problems page, dashboard card and notices, Notifications switch, navigation.
   - Playwright `tests/e2e/admin/problems.spec.ts` covers four scenarios:
     1. A wrong file type on Homework shows the same reference on screen and on the Problems page, and the group is resolved.
     2. An aborted upload settles and is recorded.
     3. A stale action id shows the refresh message and is recorded.
     4. A staff account can't open Problems or switch alerts.
   - Axe on the new page. Update existing specs whose `warning`+ messages now end with a reference.
10. **GitHub clean-up reporting.**
11. **CI guard and ESLint**, run until the tree is clean.
12. **Runbook** `docs/runbooks/problem-alerts.md`: each alert, where to look, how to resolve, the dead-man notices, and searching Observability by reference. Update the build plan's status and item 23 cross-reference.
13. **Verification:** `npm run lint`, `typecheck`, `test`, `db:check`, `db:lint`, `db:test`, `test:e2e`. Then reset the local DB and re-import real content before any preview (standing owner rule).

## Assumptions

- **Scope:** admin portal, sign-in pages, background alert jobs, DB scheduled jobs and the GitHub photo clean-up. Public visitor forms and chat are **out of scope** and reuse the same pipeline in a follow-up (D5). That follow-up was built 2026-10-02 for forms with a Quick Check, chat, hand-off and listing photos (origins `server_visitor`/`browser_visitor`, `docs/cwr-reliability-round-plan.md`).
- **Service key dependency:** database recording needs `SUPABASE_SERVICE_ROLE_KEY` in the Worker. That is already build plan open item 1, and it is also needed for forms, invites and uploads. Until it is added, problems go to the server log only, and the dashboard says so.
- **Items confirmed at Gate 3 before any other work:** `after()`, `AsyncLocalStorage`, `onRequestError` on OpenNext, the `cron.job_run_details` access, and `cwr.transition` in the service context. Fallback for `after()`: `getCloudflareContext().ctx.waitUntil`. Fallback for `onRequestError`: `error.tsx` reporting.
- **Tenant:** one tenant (`cwr`). Sign-in-page events are attributed to it.
- **Services:** no new external service. MailerSend is already approved.

## DO NOT TOUCH

- The `public` schema, legacy tables, the existing non-`cwr_` cron job, and the `auth` / `storage` / `vault` / `realtime` internals.
- `docs/constitution/*`.
- Merged migrations (all changes go in new migrations).
- `cwr.audit_log`: its table, triggers, retention and read policy, and `cwr.record_audit` behaviour.
- Inbox alert email content and inbox-source recipient logic. Delivery behaviour for existing kinds (`new_request`, `visitor_copy`, `reply`, `test`) is unchanged; only the `problem` branch is added.
- Public site pages, forms and chat.
- Wording of existing `info`-level messages. Only `warning`+ messages gain a reference.

## Downstream Impact Analysis

### Level 1 — Direct

**Files:**
- Migrations A and B.
- Wrappers, `database-errors.ts`, 13 action files, `upload-actions.ts`, `photos/actions.ts`, `auth-actions.ts`.
- All admin `queries.ts`, `dashboard.ts`, `require-admin.ts`, `service-client.ts`, `middleware.ts`, `request-id.ts`, `paths.ts`.
- Upload hooks, `encode-photo.ts`, form and action components, `idle-timer.tsx`, `error.tsx` files.
- `worker.ts`, `wrangler.jsonc`, `deliveries.ts`, `process-alert-job.ts`, `dead-letters.ts`, `messages.ts`.
- Notifications actions and UI, `navigation.ts`, `eslint.config.mjs`, `ci.yml`, the clean-up script and workflow.

**Contracts:**
- The wrapper signatures.
- `LoadResult` returns.
- The `enqueueAlertJob` outcome.
- `delivery_kind` and the `alert_deliveries` checks.
- Admin request ID generation.
- `PUBLIC_ADMIN_PATHS`.

### Level 2 — Dependent

- **Every admin page and list component handles the load-failure branch.** Risk: requires plan entry (task 5); the compiler forces it.
- **Existing Playwright specs asserting exact `warning`+ text.** Risk: low; match the prefix.
- **Existing tests:**
  - `security-headers.spec.ts` asserts request-ID echo. Risk: requires plan entry; keep echo for public paths and assert generation for admin paths.
  - The Delivery log UI and `fetchRecentDeliveries` see `problem` rows. Risk: low; label them.
  - pgTAP `010`/`020`/`100`. Risk: requires plan entry (task 2).
  - `database-errors.test.ts` (no-op outside a context). Risk: low.
- **Middleware no longer clears the session on a sign-in *check error*** (a real sign-out still does). People stay signed in through a brief Auth outage instead of being thrown out. Risk: requires plan entry; covered by an e2e test with the claims call failing.
- **The `workflows.table_name` check and `install_default_workflows` are redefined.** Risk: requires plan entry; the tenants trigger reinstalls workflows, so it is tested for existing and new tenants.

### Level 3 — Cascading

- **Deploy order and previews.** Previews share the prod DB, so the fallbacks keep everything working before the migration lands. Risk: requires plan entry (covered).
- **Cloudflare account resources.** The Cron Trigger and rate-limit namespace 1003 are created by deploy. Risk: **requires human approval** (D1).
- **Security surface.** A service-only RPC and a session-verified report route; the route is reachable without a session only from the sign-in pages, with severity capped and rate-limited. Risk: **requires human approval** (D1).
- **Email volume.** Worst case about 12 digests an hour. Each send adds `alert_deliveries` rows and their audit rows, kept 3 years under the existing audit rule. Risk: low.
- **Storage.** Bucket caps and 1-year retention. A few hundred events a day at under 2 KB each is under 250 MB a year worst case, with realistic volume far lower. Risk: none.
- **Future public-site reuse (D5).** Depends on the generic origin and catalog. Risk: none now.

## Human Approval Gate (answered by owner 2026-09-27)

| # | Item | Why gated | Decision |
|---|---|---|---|
| D1 | New DB tables, functions, workflow and cron jobs; Worker Cron Trigger; report endpoint and rate limiter | Architectural and security-sensitive | **Approved** |
| D2 | Who can see the Problems page | Access control | **Approved: owners only** |
| D3 | How long problems are kept | Retention | **Approved: 1 year** |
| D4 | Who gets problem emails | Notifications | **Deferred to owner open items.** The plan builds the "Send problem emails" toggle in Notifications, and the owner chooses recipients there. No automatic fallback |
| D5 | Public site forms and chat | Scope | **Approved: follow-up plan, same pipeline** |
| D6 | External uptime and heartbeat monitor (catches whole-site or DB outages and a dead alert sender) | External service; needs the status-page provider (build plan approval item 2) | **Approved: choose the provider together with the status page** |

## Quality audit

| Area | Round 1 (self) | Round 2 | Round 3 | Round 4 | Round 5 | Round 6 |
|---|---|---|---|---|---|---|
| Coverage / completeness | A | B- | A- | A | A | A |
| Reliability | A | C | B | B+ | A- | A |
| Consistency | A | B | A- | A | A | A |
| Traceability | A | B- | A- | A | A | A |
| Security & privacy | A | C | B | A- | A- | A |
| Alerting & actionability | A | B- | B | A- | A- | A- → A (rev 8) |
| Auditability & retention | A | C | B | A | A | A |
| Testability & enforcement | A | C | B+ | A | A | A |
| Performance & cost | A | B | A- | A | A | A |
| Minimal footprint / feasibility | A | C | B | A- | A | A |

### Audit log

- **Round 1 (self-audit):**
  - Added dead-man health checks.
  - Capped anonymous severity.
  - Added the catalog and CI guard.
- **Round 2 (independent reviewer):** 23 gaps and 12 factual errors. Main ones:
  - The RPC was forgeable through `authenticated`.
  - `server-only` code was planned for inside the Worker.
  - Enum value and its use sat in one transaction.
  - `aal1` sign-in pages rejected events.
  - The report route was blocked by middleware.
  - The spike rule was open to anonymous abuse.
  - The audit trigger fired once per event.
  - `cookies()` was called inside `after()`.
  - Delivery plumbing was missing, and the cooldown dropped alerts.
  - Retries double-counted.
  - References could be shown that were never stored.
  - Several silent paths were not covered.
  - The regex CI guard could not work.
  - Browser noise would have alerted at `error`.
  - Status changes bypassed the Workflow Engine.
  - The pg_cron watermark would have backfilled and scanned the whole table.
  - Managers could route problem alerts.
  - Indexes and pagination were missing.
  - Sign-in severity was mis-mapped.
  - The browser queue could attribute events to the wrong user.
  - There was no server render capture.
  - Counts were wrong.

  All were fixed in revision 3.
- **Round 3 (reviewer re-check):** 18 gaps. Main ones:
  - The catalog audit trigger broke the migration.
  - A forgeable header and query-string notices could trigger emails.
  - The auth flag was lost on redirect.
  - The heartbeat went stale on quiet days.
  - `not_sent` runs got stuck.
  - One digest had several run ids.
  - A suppressed first alert was lost.
  - The watermark skipped running jobs.
  - Managers could change a flagged recipient's email.
  - Escalations waited out the cooldown.
  - Workflow roles were decorative.
  - The GitHub script import couldn't work.
  - Catalog parity parsed an immutable migration.
  - The checker's rule was undefined.
  - Server crashes produced duplicate references.
  - "Not saved" wording was wrong on timeouts.
  - Browser `code` was unbounded.
  - The health row was updated on every event.

  All were fixed in revision 4 (the sections above).
- **Round 4 (reviewer re-check):** 6 areas were A. Four gaps remained:
  - A `getClaims` error was treated as an outage, so a garbage cookie could email the owner.
  - One permanently failing recipient blocked all future digests.
  - The problem-log health check never cleared after a failure.
  - Bot `captcha_failed` posts could spike.

  Plus one feasibility note: qualify `extensions.uuid_generate_v5`. All were fixed in revision 5.
- **Round 5 (reviewer re-check):** 7 areas were A. Three gaps remained in the new fixes:
  - A forged token with an unsupported algorithm was classed as an outage.
  - A revoked MailerSend key marked runs as sent and silently stopped problem emails.
  - The database's own events could clear the log-health alarm.

  All were fixed in revision 6.
- **Round 6 (reviewer re-check):** 9 of 10 areas were A.
  - The one contradiction: the start-of-run heartbeat could set `last_ok_at`.
  - Revision 7 splits that out into `touch_heartbeat`, adds `last_error_at` with null-safe comparison, adds abandoned-run backoff, and adds tests.
- **Round 7 (reviewer re-check):** the contradiction was resolved. Two one-line breaks were found:
  - The null-unsafe once-a-minute throttle.
  - The photo clean-up stale check read the wrong column.

  Revision 8 fixes both (`coalesce(…, '-infinity')`; `touch_health_check` sets `last_run_at`; the check reads `last_ok_at`). The reviewer stated that these two fixes make all 10 areas A.
