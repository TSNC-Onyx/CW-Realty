# Runbook: problem alerts and the problem log

Governs: Infra §7 ("a written runbook for each critical system"). Design: `docs/cwr-error-tracking-plan.md`.

## What gets recorded

Every problem someone sees in the admin portal, on the sign-in pages, or on the public website (origins `server_visitor` and `browser_visitor`) is saved in `cwr.problem_events`, and counted in `cwr.problem_groups` (one row per kind of problem). Each has a reference code like `CWR-7F3-K2Q`.

People see that code on screen for anything worse than a typing mistake, for example "(Ref CWR-…)" or "Reference: CWR-…".

| Severity | Meaning | Emailed? |
|---|---|---|
| info | The person can fix it (typo, name in use, wrong code) | Only a spike (20+ wrong passwords or codes in 15 minutes) |
| warning | Done but degraded, or stale page / wrong role | No |
| error | Something is broken | Yes |
| critical | An outage, setup missing, or a half-finished change | Yes, even within the hour cooldown when it escalates |

## Who gets the emails

**Problem emails resume with the email outbox** (owner decision 2026-10-12, `docs/cwr-email-outbox-plan.md`). They were paused on 2026-09-30 because the Cloudflare account had no free Cron Trigger. Now a database job (`cwr_problem_digest`, every 5 minutes) adds a digest job to the outbox, and the email-worker sends it. Until the outbox is switched on (`docs/runbooks/email-outbox.md`, step 2), they stay paused, and the dashboard and Notifications page say so.

An owner switches people on with **Send problem emails** on Admin → Notifications (owner decision D4, 2026-09-27; build plan open item 10).

Until someone is switched on, problems are still recorded but no one is emailed, and the Notifications page says so.

The email is a digest, sent at most every 5 minutes. The same problem is repeated at most once an hour unless it gets worse or comes back after being resolved. It contains only section names, action names, counts, times, and reference codes. It never contains anything a person typed.

## Where to look

1. **The reference code.** Owners can read `cwr.problem_events` (Supabase → Table editor, schema `cwr`, or SQL):
   ```sql
   select occurred_at, action, stage, severity, code, shown_message, detail, actor_role, page_path, request_id
   from cwr.problem_events where reference = 'CWR-XXX-XXX';
   ```
   The Problems page in the admin portal is deferred (owner, 2026-09-27).
2. **"May not be saved".** This means the database did not confirm the write. Search Cloudflare → Workers & Pages → `cw-realty` → Observability → Logs for the reference, within 7 days. Every problem is written there first as a JSON line with `"message":"problem"`, whether or not the database saved it.
3. **Follow one request end to end.** Use the `request_id` column: the same value is on `cwr.audit_log.request_id` and on the Workers log lines.

## Dead-man notices (owner dashboard)

Each background check watches another one, so a stopped check is caught by the next one along.

| Notice | Checked by | What to do |
|---|---|---|
| Problem emails aren't being checked | Database watchdog (every 15 min) sees the Worker's 5-minute heartbeat is over 20 min old. Can't appear while problem emails are paused (the heartbeat is removed) | Cloudflare → `cw-realty` → Triggers: the `*/5 * * * *` Cron Trigger must exist; check the Worker's logs for `scheduled` errors |
| Database clean-up checks aren't running | The dashboard sees the database watchdog is over 45 min old. While problem emails are on, the Worker's 5-minute run also records it as a critical problem | Supabase → Database → Cron Jobs: `cwr_check_scheduled_jobs` must be active; see `cron.job_run_details` |
| The nightly photo clean-up hasn't finished | Database watchdog: no successful run in 36 h | GitHub → Actions → "Clean up unused photo files": a skipped run means the repository secret `SUPABASE_SERVICE_ROLE_KEY` or variable `NEXT_PUBLIC_SUPABASE_URL` is missing |
| The problem log couldn't save a problem | Database watchdog / the app | Usually the Worker secret `SUPABASE_SERVICE_ROLE_KEY` is missing; problems then reach the Workers log only |
| Problem emails are failing | Alert sender | The MailerSend key or sender address is wrong or revoked; fix it in the Worker's secrets. Pending problems go out on the next run (retries back off up to an hour) |

A failed or stuck (over 30 min) `cwr_*` scheduled job becomes a critical problem named "Nightly database clean-up". Its `detail` holds the job name and Postgres's message.

## Forwarding to BuiltFor Ops

Every error or critical problem is also sent to BuiltFor's Ops inbox (BuiltFor `tenant-alert-receiver`), so BuiltFor sees outages without being asked. A database job, `cwr_forward_builtfor`, runs every minute: it queues new error/critical problems in `cwr.builtfor_forwards` and sends them with pg_net. Warnings and info problems are never sent. Nothing about how problems are recorded or emailed here changes. Migration: `supabase/migrations/20261021000100_cwr_builtfor_forward.sql`.

**Switch on** (SQL editor; the secret value comes from BuiltFor):

```sql
select vault.create_secret('<BuiltFor BUILTFOR_WEBHOOK_SECRET>', 'builtfor_webhook_secret');
insert into cwr.builtfor_forward_settings (local_tenant_id, builtfor_tenant_id, builtfor_tenant_name, receiver_url, is_enabled)
values (cwr.get_default_tenant_id(), 'f25f2615-2262-4d95-8926-36277920572f', 'Charlie Ward Realty',
        'https://tsdcxvmywimqfpdkevdx.supabase.co/functions/v1/tenant-alert-receiver', true);
```

Only problems recorded after `forward_from` (default: when the row was added) are sent.

**Switch off:** `update cwr.builtfor_forward_settings set is_enabled = false;`

**Check:**

```sql
select status, count(*), min(created_at), max(last_error) from cwr.builtfor_forwards group by status;
```

`pending` rows are waiting or retrying: failed sends retry with a growing wait (up to an hour). After 24 hours of failures a row becomes `dead`, and one critical problem with code `builtfor_forward_dead` is recorded here ("… alerts could not be delivered to BuiltFor Ops"); that problem is itself sent once the link works again. Usual causes: the Vault secret doesn't match BuiltFor's, or the receiver is down. `sent` rows are removed after 30 days.

**Remove completely:** `docs/runbooks/builtfor-forward-down.sql`, then delete the Vault secret.

## After fixing

Record what happened and the follow-up (Infra §7 "blameless review"). Until the Problems page exists, a developer resolves a group with:

```sql
select cwr.transition('problem_status', '<problem_groups.id>', 'resolved');
```

The group reopens automatically if the problem happens again.

## Retention

Problems are kept for 1 year (owner decision D3). They are purged nightly by `cwr_purge_problems`, and the problem log is append-only otherwise.
