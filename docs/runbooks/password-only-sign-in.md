# Runbook: release password-only admin sign-in

Admin sign-in became email and password only, with passwords of at least 8 characters
(owner choice 2026-10-09, docs/cwr-password-only-sign-in-plan.md). Releasing it to the live site
takes five steps, **in this order**. Ask the owner before steps 1, 2, 4, and 5.

## 1. Database update

Apply migration `20261009000200_cwr_password_only_sessions.sql` (with any earlier unapplied ones).
On its own this changes nothing anyone sees: the website still asks for the code, and the database
now accepts a signed-in session with or without one.

If the website were released first, every admin screen would fail to load, because the database
would still demand the code.

## 2. Supabase Auth settings

Supabase → the project → Authentication → Policies (Password security):

| Setting | Value |
|---|---|
| Minimum password length | **8** |
| Password requirements | Lowercase, uppercase letters and digits |
| Prevent use of leaked passwords | **On** (strongly recommended; refuses passwords found in known data breaches). Supabase offers it on paid plans; if the switch is unavailable, note that here and tell the owner |

If the website were released before the minimum is lowered, it would accept an 8–11 character
password that Supabase then refuses ("Choose a longer, less common one").

## 3. Release the website

The usual merge and deploy. Sign in once with email and password to confirm the dashboard opens.

## 4. Remove the old authenticator codes

Accounts set up before the change still have a code in Supabase, which blocks them from changing
their password. With the live project's URL and service-role key:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/remove-sign-in-codes.mjs
```

That only lists who has a code (1 owner account on 2026-10-09). Then:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/remove-sign-in-codes.mjs --apply
```

Each removal is written to the activity log. Afterwards, the owner can delete the CWR entry from
their authenticator app.

## 5. Turn off authenticator setup

Supabase → the project → Authentication → Multi-Factor → Authenticator app (TOTP): turn **enrollment
off**. The website no longer uses codes, and leaving enrollment on would let someone holding a
stolen session add a code to an account, which would then block that person's own password reset
until step 4 is run again. (The local test setup in `supabase/config.toml` keeps it on for one
test.)

## If something goes wrong

- "This account still has an old sign-in code…" when saving a password: step 4 hasn't run for that
  person (or a code was added before step 5); run step 4 again.
- Every admin screen says something didn't load right after release: step 1 was missed; apply the
  migration.
