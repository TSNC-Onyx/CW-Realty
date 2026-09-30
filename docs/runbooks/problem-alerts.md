# Runbook: problem alerts and the problem log

Governs: Infra §7 ("a written runbook for each critical system"). Design: `docs/cwr-error-tracking-plan.md`.

## What gets recorded

Every problem someone sees in the admin portal or on the sign-in pages is saved in `cwr.problem_events`, and counted in `cwr.problem_groups` (one row per kind of problem). Each has a reference code like `CWR-7F3-K2Q`.

People see that code on screen for anything worse than a typing mistake, for example "(Ref CWR-…)" or "Reference: CWR-…".

| Severity | Meaning | Emailed? |
|---|---|---|
| info | The person can fix it (typo, name in use, wrong code) | Only a spike (20+ wrong passwords or codes in 15 minutes) |
| warning | Done but degraded, or stale page / wrong role | No |
| error | Something is broken | Yes |
| critical | An outage, setup missing, or a half-finished change | Yes, even within the hour cooldown when it escalates |

## Who gets the emails

**Problem emails are paused** (owner decision 2026-09-30): the Cloudflare account's Workers Free plan allows 5 Cron Triggers and all are in use, so the 5-minute sender has no schedule. Problems are still recorded; the dashboard and Notifications page say emails are paused. To resume: free a Cron Trigger or move to Workers Paid, set `"triggers": { "crons": ["*/5 * * * *"] }` in `wrangler.jsonc` and `ARE_PROBLEM_EMAILS_PAUSED = false` in `src/lib/jobs/problem-alert-schedule.ts`, then deploy (the sender's first run recreates its heartbeat, removed by migration `20260930000100`).

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
| Problem emails aren't being checked | Database watchdog (every 15 min) sees the Worker's 5-minute heartbeat is over 20 min old | Cloudflare → `cw-realty` → Triggers: the `*/5 * * * *` Cron Trigger must exist; check the Worker's logs for `scheduled` errors |
| Database clean-up checks aren't running | The Worker sees the database watchdog is over 45 min old | Supabase → Database → Cron Jobs: `cwr_check_scheduled_jobs` must be active; see `cron.job_run_details` |
| The nightly photo clean-up hasn't finished | Database watchdog: no successful run in 36 h | GitHub → Actions → "Clean up unused photo files": a skipped run means the repository secret `SUPABASE_SERVICE_ROLE_KEY` or variable `NEXT_PUBLIC_SUPABASE_URL` is missing |
| Problem log isn't saving | Database watchdog / the app | Usually the Worker secret `SUPABASE_SERVICE_ROLE_KEY` is missing (build plan open item 1); problems then reach the Workers log only |
| Problem emails are being refused | Alert sender | The MailerSend key or sender address is wrong or revoked; fix it in the Worker's secrets. Pending problems go out on the next run (retries back off up to an hour) |

A failed or stuck (over 30 min) `cwr_*` scheduled job becomes a critical problem named "Nightly database clean-up". Its `detail` holds the job name and Postgres's message.

## After fixing

Record what happened and the follow-up (Infra §7 "blameless review"). Until the Problems page exists, a developer resolves a group with:

```sql
select cwr.transition('problem_status', '<problem_groups.id>', 'resolved');
```

The group reopens automatically if the problem happens again.

## Retention

Problems are kept for 1 year (owner decision D3). They are purged nightly by `cwr_purge_problems`, and the problem log is append-only otherwise.
