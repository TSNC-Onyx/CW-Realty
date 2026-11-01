# Runbook: 623 Summit in this Supabase project

623 Summit (https://623summit.pages.dev, repo `623Summit`) is a separate site that keeps its data in
this project's `summit` schema and signs its owners in through this project's sign-in system
(owner request 2026-10-22, plan `docs/summit-shared-database-plan.md`). This replaced 623's own
Supabase project (`jauwwpluqjeefokxolea`).

## What is shared and what is not

| Shared | Kept apart |
|---|---|
| The database server, backups, and plan limits | Data: 623 is only in `summit`; CWR is in `cwr` / `cwr_private` |
| The sign-in system: one email is one login with one password on both sites | Who gets in: CWR checks `cwr.memberships`, 623 checks `summit.admins` |
| Sign-in rules: the robot check, invite-only, the password rule, the email send limit | Emails: reset and invite pick the 623 or CWR version by the return address (`supabase/functions/email-worker/summit.ts`) |
| Edge Function secrets (one list for the project) | Scheduled jobs: 623's start with `summit_`, which the CWR job watcher ignores |

A 623 owner with no CWR membership sees only what any visitor sees on the CWR side, and a CWR user
not on `summit.admins` sees nothing of 623 (`supabase/tests/database/270-summit-isolation.test.sql`).

## Names reserved for 623 Summit

- Schema `summit`; cron jobs `summit_purge_old_technical_data`, `summit_expire_stale_holds`,
  `summit_email_sweep` (every minute) and `summit_purge_email_jobs` (daily at 04:19).
- Edge Functions `submit-form`, `manage-booking`, `summit-invite-owner`, `summit-email-worker`. They
  are deployed from the 623Summit repo, never from this one. Never give a CWR function one of these
  names.
- Function secrets `SUMMIT_ALLOWED_ORIGIN` (the 623 site address), and for `summit-email-worker`:
  `SUMMIT_EMAIL_FROM` (an address on CWR's verified MailerSend domain), `SUMMIT_EMAIL_FROM_NAME`
  (default "623 Summit Avenue"), `SUMMIT_SITE_URL` (must be one of the `SUMMIT_ALLOWED_ORIGIN`
  entries; default the first) and `SUMMIT_EMAIL_TRANSPORT` (`mailersend`, the default, or `log` on an
  http site only). The worker also reads the project's shared `MAILERSEND_API_KEY`.
- Vault secret `summit_email_worker_secret` (made by the migration; the database sends it when it
  wakes `summit-email-worker`).
- Migrations for `summit` live in this repo. The 623Summit repo has no migrations and must never run
  `supabase db push`.

## Owner settings that 623 needs (done once, at the switch)

1. Supabase → Data API → Exposed schemas: `summit` is listed alongside `public`, `graphql_public`, `cwr`.
2. Supabase → Authentication → URL Configuration → Redirect URLs: `https://623summit.pages.dev/admin`
   and `https://*.623summit.pages.dev/admin`.
3. Cloudflare → Turnstile → the CWR widget → Hostnames: `623summit.pages.dev`.
4. The email templates are pushed with `node scripts/push-auth-email-templates.mjs` like any other
   template change (`docs/runbooks/auth-email-templates.md`).

## 623's guest email queue

623 has its own email queue in `summit`, built like CWR's outbox but separate from it
(`supabase/migrations/20261031000100_summit_email_outbox.sql`, tests in
`supabase/tests/database/300-summit-email-outbox.test.sql`; plan: 623Summit repo
`docs/guest-email-plan.md`). Booking changes queue rows in `summit.email_jobs`; `summit-email-worker`
claims and sends them through MailerSend. CWR's queue, worker and Notifications log never see them.

The settings row is `summit.email_settings` (exactly one row):

| Column | Meaning |
|---|---|
| `is_live` | Off by default. Off means nothing is queued, claimed or sent, and the 623 pages make no email promise. Waiting emails still expire after 48 hours. |
| `worker_url` | The `summit-email-worker` address (`https://<ref>.supabase.co/functions/v1/summit-email-worker`). Null keeps the wake-up off. |
| `reply_to` | Reply-To on guest emails. Empty: no Reply-To, and the footer gives the house phone. |
| `owner_alert_to` | Addresses for owner alerts. Empty: no owner alerts are queued. |
| `daily_limit` | Emails sent per 24 hours before claiming stops (default 200), protecting the MailerSend limits CWR shares. |

Change it in the SQL editor, for example `update summit.email_settings set is_live = false;`.

### Deploy order (each step owner-approved)

1. Get the migration onto CW-Realty `main` (that push runs `supabase db push`; note it also ships
   every other unreleased `build1` commit). Sending stays off.
2. Deploy `summit-email-worker`, `manage-booking` and `submit-form` from the 623Summit repo.
3. Set the secrets above, then `update summit.email_settings set worker_url = '<worker address>';`.
4. Merge the 623Summit branch to its `main` (Cloudflare Pages publishes the pages).
5. `update summit.email_settings set is_live = true;`
6. Book a test stay under an address that is not an owner's; check the email arrives and its link
   opens; cancel the test booking.

### Undo, in this order

1. `update summit.email_settings set is_live = false;` This stops queueing, claiming and wake-ups at
   once.
2. Revert the 623Summit commits, redeploy `manage-booking` and `submit-form`, delete
   `summit-email-worker`, and publish the reverted pages. Until this is done the pages and functions
   still read `email_guest`, `email_jobs` and `email_settings`, so do not run step 3 first.
3. Only if asked, a new forward migration that:
   - unschedules `summit_email_sweep` and `summit_purge_email_jobs`;
   - drops the triggers `bookings_queue_email` and `email_jobs_wake_worker` and the new functions;
   - drops `summit.email_jobs`, `summit.email_settings`, `summit.link_requests`,
     `summit.token_rotations` and the types `summit.email_job_kind`, `summit.email_job_status`;
   - drops `summit.bookings.email_guest`;
   - runs `delete from summit.lookup_events where outcome = 'resend'`, then re-adds
     `lookup_events_outcome_allowed` as `check (outcome in ('found', 'not_found'))`.
4. Remove the Vault secret `summit_email_worker_secret` by hand in the SQL editor. A migration
   cannot do it: `npm run db:check` forbids writing to `vault`.

## Adding and removing a 623 owner

- Add: a 623 owner signs in at https://623summit.pages.dev/admin and uses **Invite an owner**. The new
  owner gets a 623-branded invite. Someone who already has a CWR login is simply added to the list
  and signs in with their existing password.
- Remove: an owner uses **Remove access** (or **Cancel the invite**) in the console's Owners tab,
  which calls `summit.remove_owner()`. Nobody can remove themselves. Their login stays (it may also be a
  CWR login). To delete a login that is only a 623 login, use Supabase → Authentication → Users. The
  list of logins that belong only to 623 is:
  `select email from auth.users where email::extensions.citext in (select email from summit.admins) and id not in (select user_id from cwr.memberships);`

## Retiring the old project

The old project stays untouched for 7 days after the switch. Then check that nothing real landed there:
`select count(*) from public.<table> where created_at > '<switch time>'` for `bookings`, `inquiries`,
`blackouts`, `booking_payments`. Report anything found to the owner, then pause the project. The owner
deletes it later.

## Undo

1. Revert the 623Summit pull request. The site points back to the old project, which still works.
2. Owner: remove `summit` from Exposed schemas, the two 623 redirect URLs, and the 623 Turnstile hostname.
3. Templates: `node scripts/push-auth-email-templates.mjs --restore .auth-email-backup-<time>.json`.
4. Functions: `npx supabase functions delete submit-form --project-ref egadvqpatnlkvgiiszzx` (and
   `manage-booking`, `summit-invite-owner`), then `npx supabase secrets unset SUMMIT_ALLOWED_ORIGIN --project-ref egadvqpatnlkvgiiszzx`.
5. Database, as a new migration (it passes `npm run db:check` because `summit_` jobs belong to this repo):

   ```sql
   select cron.unschedule('summit_purge_old_technical_data');
   select cron.unschedule('summit_expire_stale_holds');
   select cron.unschedule('summit_email_sweep');
   select cron.unschedule('summit_purge_email_jobs');
   drop schema summit cascade;
   ```

   `citext` and `btree_gist` stay installed; nothing else uses them, and they are harmless.
