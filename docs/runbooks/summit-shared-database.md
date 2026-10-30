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

- Schema `summit`; cron jobs `summit_purge_old_technical_data`, `summit_expire_stale_holds`.
- Edge Functions `submit-form`, `manage-booking`, `summit-invite-owner`. They are deployed from the
  623Summit repo, never from this one. Never give a CWR function one of these names.
- Function secret `SUMMIT_ALLOWED_ORIGIN` (the 623 site address).
- Migrations for `summit` live in this repo. The 623Summit repo has no migrations and must never run
  `supabase db push`.

## Owner settings that 623 needs (done once, at the switch)

1. Supabase → Data API → Exposed schemas: `summit` is listed alongside `public`, `graphql_public`, `cwr`.
2. Supabase → Authentication → URL Configuration → Redirect URLs: `https://623summit.pages.dev/admin`
   and `https://*.623summit.pages.dev/admin`.
3. Cloudflare → Turnstile → the CWR widget → Hostnames: `623summit.pages.dev`.
4. The email templates are pushed with `node scripts/push-auth-email-templates.mjs` like any other
   template change (`docs/runbooks/auth-email-templates.md`).

## Adding and removing a 623 owner

- Add: a 623 owner signs in at https://623summit.pages.dev/admin and uses **Invite an owner**. The new
  owner gets a 623-branded invite. Someone who already has a CWR login is simply added to the list
  and signs in with their existing password.
- Remove: ask Claude to delete their row from `summit.admins`. Their login stays (it may also be a
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
   drop schema summit cascade;
   ```

   `citext` and `btree_gist` stay installed; nothing else uses them, and they are harmless.
