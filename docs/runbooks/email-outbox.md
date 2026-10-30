# Runbook: the email outbox

Governs: every Charlie Ward Realty email. Design: `docs/cwr-email-outbox-plan.md` (owner approved 2026-10-12).

## How it works

1. Something needs an email: a new request or reply (database trigger, same transaction), a test alert or Retry (the site), a sign-in email (Supabase Auth's Send Email hook, `cwr.handle_auth_email`), or the 5-minute problem digest (`cwr_problem_digest` cron job).
2. A row lands in `cwr.email_jobs`. One-time sign-in link values go in `cwr_private.email_job_secrets`, which no API role can read.
3. The insert wakes the `email-worker` Edge Function through `pg_net`. The worker answers at once, then claims due jobs, fills `supabase/functions/email-worker/templates.ts`, and sends through MailerSend.
4. `cwr_email_sweep` runs every minute and wakes the worker again if anything is still due (retries wait 1, 5, 15 and 60 minutes; after the 5th try the job is "failed" and shows Retry on Admin → Notifications).

## Where things are

| What | Where |
|---|---|
| Templates (all 18 emails) | `supabase/functions/email-worker/templates.ts` |
| Worker code | `supabase/functions/email-worker/` (deploy settings: `deno.json`) |
| Cutover switch, worker address, link lifetime | `cwr.email_settings` (`is_outbox_live`, `worker_url`, `link_lifetime_seconds`) |
| Wake-up secret | Vault secret `cwr_email_worker_secret` (made by the migration; the worker reads it from the database) |
| Worker settings (live) | Supabase → Edge Functions → Secrets |
| Local test inbox | Mailpit, `http://127.0.0.1:55324` (`npm run db:start`) |

## Rollout (owner, with Claude)

**Step 0 — fallback first.** Push the branded fallback templates and notice switches: `node scripts/push-auth-email-templates.mjs --dry-run`, then without `--dry-run` (steps in `docs/runbooks/auth-email-templates.md`). Undo: `--restore <backup>`.

**Step 1 — install (nothing changes for anyone yet).**
1. Claude applies migrations `20261012000100` and `20261012000200` to the live project (with your OK).
   The live project already has the later `20261021000200` (Meta send health, applied 2026-10-21), and
   `20261012000200` rewrites the background-check names without `meta_conversions`. So, in one go: delete any
   `meta_conversions` row from `cwr.health_checks` (the next lead sent to Meta writes it again), apply
   `20261012000200`, then re-run the three `health_checks_name_check` lines from `20261021000200`.
2. Deploy the worker: `npx supabase functions deploy email-worker --no-verify-jwt --project-ref egadvqpatnlkvgiiszzx` (or Claude deploys it with your OK).
3. In Supabase → Edge Functions → Secrets, add:
   - `MAILERSEND_API_KEY` — the same key the Cloudflare Worker uses;
   - `ALERT_FROM_EMAIL` and `ALERT_FROM_NAME` — the same sender as today;
   - `EMAIL_SITE_URL` — `https://cw-realty.builtfor.workers.dev` before launch, `https://www.charliewardrealty.com` after launch (links and the logo use it).
   Leave `EMAIL_TRANSPORT` unset (MailerSend).

**Step 2 — site emails switch to the outbox.** Claude runs, with your OK:
```sql
update cwr.email_settings
set worker_url = 'https://egadvqpatnlkvgiiszzx.supabase.co/functions/v1/email-worker', is_outbox_live = true
where tenant_id = cwr.get_default_tenant_id();
```
Check:
- Admin → Notifications → **Send test alert**: it arrives within a minute, and the log shows "Sent".
- Send yourself a message through the website's contact form: the alert and the visitor copy arrive.
- The dashboard shows no email warnings, and the Notifications page no longer says problem emails are paused.
Undo: set `is_outbox_live = false`. The site goes straight back to the Cloudflare path; no redeploy. Emails can't go out twice during the switch (the delivery log's duplicate guard). Jobs already in the outbox still need the email-worker: if you're undoing because the worker is broken, ask Claude to re-send those through the old path (Admin → Notifications → Retry works for failed ones once the switch is off).

**Step 3 — sign-in emails switch to the outbox (a few days later).**
0. **Before this step, 623 Summit needs its own sign-in emails in the outbox.** 623 Summit shares this sign-in system (`docs/runbooks/summit-shared-database.md`). Today its reset and invite emails come from the fallback templates, which choose the 623 version by the return address. The hook skips those templates, so first ask Claude to make `cwr.handle_auth_email` and the worker send 623 requests (return address on 623summit.pages.dev) with the 623 version from `supabase/functions/email-worker/summit.ts` and Supabase's `/auth/v1/verify` link. Otherwise 623 resets and invites arrive CW-branded with a link 623 owners can't use.
1. `node scripts/push-auth-email-templates.mjs --hook on --dry-run`, then `--hook on` (hidden token prompt, backup, read-back check).
2. Test: "Forgot password" for your own account — the email arrives, its button opens "Choose a password", and a "Your password was set or changed" email follows. Invite a throwaway address, accept it, then remove that user.
Undo: `node scripts/push-auth-email-templates.mjs --hook off` — Supabase's own mailer takes over again with the branded fallback templates from step 0.

**Step 4 — clean-up (after one clean week).** Ask Claude for the contract change: remove the Cloudflare queues and consumers (`worker.ts`, `wrangler.jsonc`), the old path in `src/lib/jobs/enqueue-alert-job.ts`, and the site's MailerSend settings.

## Watching it

- Dashboard (owners): "An email is waiting to go out" (an email has waited more than 5 minutes), "Emails can't be sent" (the worker's MailerSend settings are missing or wrong), "The email backup check isn't running" (the minute job stopped).
- Admin → Notifications → Recent emails: every email with its status; sign-in emails show "Sign-in or account email" and can't be retried (the person asks for a new link).
- Problem log: `jobs.alert_email` (a job couldn't run), `jobs.alert_dead_letter` (an email gave up).
- Raw view (SQL editor): `select kind, action_type, status, attempts, last_error, created_at from cwr.email_jobs order by created_at desc limit 50;`

## Changing the wake-up secret

```sql
select vault.update_secret((select id from vault.secrets where name = 'cwr_email_worker_secret'), encode(extensions.gen_random_bytes(32), 'hex'));
```
The worker reads the secret from the database on every call, so the change takes effect at once; nothing else needs updating.

## Sign-in link lifetime

The owner script prints a note if Supabase's link lifetime (Authentication → Emails → expiry) isn't the default 3600 seconds. Then Claude sets `cwr.email_settings.link_lifetime_seconds` to match, so an unsent link is dropped before it expires rather than sent dead.
