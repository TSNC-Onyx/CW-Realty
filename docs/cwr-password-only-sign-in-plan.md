# Admin sign-in with email and password only — plan (to-do item 7 of 8, 2026-10-09)

Status: APPROVED by owner 2026-10-09 (revision 2, 8-character passwords; security trade-off accepted); BUILT on branch claude/website-updates-todo-5efd86. See "Build notes". Security-sensitive change: the owner gave the explicit yes to the trade-off
below on 2026-10-09.

## Goal

People sign in to the admin portal with their email and password only; the authenticator-app code step is gone
everywhere (sign-in, first sign-in, password reset, invites), and the database accepts a password-only session.
New passwords need at least 8 characters (was 12), still with a lowercase letter, an uppercase letter, and a number.

Owner requests (2026-10-09): "remove auth code from login requirement, email and password only"; then "change to
8 character passwords".

## The trade-off (plain language)

The 6-digit code means a stolen or guessed password alone can't open the admin portal. Without it, the password is
the only lock. Standards bodies treat password-only as the lowest level (NIST SP 800-63B: "AAL1"; OWASP ASVS 5.0
and CISA recommend multi-factor for admin accounts). The portal can change listings, contact details, tracking
IDs, users, and see leads' names, emails, and phone numbers.

Shorter passwords add to that: NIST SP 800-63B-4 asks for at least **15** characters when a password is the only
sign-in factor (8 is its minimum only when a second factor such as the code is also used). An 8-character
password with mixed case and a number is far quicker to guess offline than a 12-character one, and is more
likely to be reused from another site.

What still protects the portal after the change (already built): the Quick Check bot test on sign-in (stops
automated password guessing), mixed case + number required, Supabase's sign-in rate limits, sign-out after 30 idle
minutes, owner-only areas checked on the server and in the database, and every change logged with who and when.

Owner settings (Supabase dashboard → Authentication → Policies; listed in the runbook):
1. **Minimum password length: 8** — required, so the login service accepts what the website now allows.
2. **Prevent use of leaked passwords** — strongly recommended: refuses passwords found in known data breaches,
   which matters more now that short passwords are allowed.

Existing passwords keep working; the new rule only applies when someone sets or resets a password.

## Current state (checked 2026-10-09)

- Live site: 1 admin account (owner), with an authenticator code set up.
- The code is required in 3 layers: the sign-in flow (`/admin/mfa`, `/admin/mfa/setup`), every admin page check
  (`require-admin.ts`: `aal !== "aal2"` → code step), and the database (`cwr.is_mfa_verified()` inside
  `cwr.tenant_ids_with_role`, used by every admin Row Level Security rule).
- Supabase blocks a password change for anyone who still has a code set up unless they enter it, so existing codes
  must be removed when this goes live (edge case 1).

## Scope

In scope:
- Sign-in: password → straight to the page they asked for (dashboard by default).
- First sign-in after an invite and password reset: set password → straight in.
- `/admin/mfa` and `/admin/mfa/setup` become redirects (signed in → dashboard; signed out → sign-in), so old
  bookmarks and emails don't break.
- Users & roles: the "Sign-in codes on / not set up" line and the "Reset sign-in codes" button are removed; the
  intro says "Everyone signs in with their email and a password."
- Database: a password-only session counts as signed in for every admin rule (new migration redefining
  `cwr.is_mfa_verified()` to accept `aal1` or `aal2`, renamed in comments as "signed-in session").
- One-time removal of existing authenticator codes for CWR admin accounts at release (script, run only with the
  owner's OK).
- Password rule: minimum 8 characters (was 12), still lowercase + uppercase + number, in the website's check
  (`MIN_PASSWORD_LENGTH` in `src/lib/admin/auth-schemas.ts`, which also drives the helper text "At least 8
  characters…"), the local login settings (`supabase/config.toml` `minimum_password_length = 8`), and the live
  login service's setting (owner/developer step in the runbook).
- Docs: Infra §2 and Admin §7 constitution lines amended (owner choice 2026-10-09), README sign-in line,
  `docs/runbooks/password-only-sign-in.md` (release order + the two Supabase settings).

Out of scope: passkeys, email codes, sign-in alert emails (possible later additions); changing roles or who can
see what; the public site.

## Architecture context

Supabase Auth issues `aal1` after a password and `aal2` after a code. Admin pages call `requireAdminPage` →
`fetchAdminContext` (`src/lib/admin/require-admin.ts`); sign-in steps live in `src/lib/admin/auth-actions.ts`,
`auth-pages.ts`, `src/components/admin/auth/*`; Users & roles in `src/lib/admin/users/*` and
`src/components/admin/users/*`. RLS helpers are in `supabase/migrations/20260925000100_cwr_foundation.sql`.

## Task breakdown

1. Tests first:
   - pgTAP: flip the "owner cannot change without a multi-factor sign-in" checks (`060-site-settings` and any other
     `aal1` checks) to "a password-only owner can"; add "a signed-out visitor still cannot".
   - Unit: auth outcome/schema tests drop code-step cases; password rule accepts an 8-character mixed-case
     password with a number (`Short1Ab`), rejects 7 characters ("Use at least 8 characters") and 8 characters
     missing a number or a case; session-timing tests unchanged.
   - Playwright (`tests/e2e/admin/auth.spec.ts`, helpers): owner signs in with email + password and lands on the
     dashboard; invited person sets a password and lands on the dashboard; password reset works without a code;
     `/admin/mfa` and `/admin/mfa/setup` redirect; Users & roles shows no sign-in-code line or button; wrong
     password and no-role cases unchanged; `signInFully` helper simplified (every admin test uses it); setting an
     8-character password on the set-password screen works and the helper text says "At least 8 characters".
2. Migration `supabase/migrations/20261009000200_cwr_password_only_sessions.sql`: `create or replace function
   cwr.is_mfa_verified()` → `select coalesce(auth.jwt() ->> 'aal', '') in ('aal1', 'aal2')` with a comment.
3. `require-admin.ts`: drop the `aal2` redirect and `getMfaPath`.
4. `auth-actions.ts` / `auth-pages.ts`: sign-in redirects to the next page; remove the code-verify, setup, and
   factor-cleanup actions and the "code before password" block; `requirePasswordOnlyStage` callers updated.
5. Delete `app/admin/(auth)/mfa/setup/page.tsx`, `src/components/admin/auth/mfa-form.tsx`, `mfa-setup.tsx`;
   `app/admin/(auth)/mfa/page.tsx` and a new `mfa/setup/route` become redirects.
6. Users & roles: remove sign-in-code status, `resetSignInCodesAction`, its button and audit hook; update the
   intro sentence. Problem catalog: retire the code-step actions in TS; database rows stay (old problem reports
   still name them).
7. Script `scripts/remove-sign-in-codes.mjs`: lists CWR admin accounts with codes and removes them through the
   Supabase admin API (dry run by default; `--apply` to remove); records an audit entry per person.
8. Password rule: `MIN_PASSWORD_LENGTH = 8` and its comment in `auth-schemas.ts`; `supabase/config.toml`
   `minimum_password_length = 8`.
9. Docs as listed in Scope.
10. Full checks (typecheck, lint, design, unit, pgTAP, full browser suite on clean data), screenshots of sign-in on
   phone and desktop, reload real content, independent security-focused review.

## Release order (important)

1. Apply the database migration first. On its own it changes nothing visible: the website still asks for the
   code, and the database accepts both.
2. Set the live login service's minimum password length to 8 (and turn on leaked-password protection). On its own
   this changes nothing visible: the website still asks for 12.
3. Then release the website.
4. Then run `remove-sign-in-codes` with the owner's OK (1 account today).
Releasing the website before the database update would make every admin screen fail to load (the database
would still demand the code); releasing it before the login-service setting would let the website accept an
8–11 character password that the login service then refuses. The runbook states this order.

## Assumptions

- Applies to every admin role (owner, manager, staff).
- Existing authenticator apps on phones can simply be deleted by their owners afterwards.

## DO NOT TOUCH

- Role checks (`EDITOR_ROLES`, `OWNER_ROLES`), RLS policies other than the one helper, the owner-only database
  guards, Quick Check (Turnstile), idle timeout, audit log, password rules, public site.

## Downstream Impact Analysis

### Level 1 — Direct
Files: new migration; `require-admin.ts`; `auth-actions.ts`; `auth-pages.ts`; `auth-outcomes.ts`;
`auth-schemas.ts` (password minimum 8); `password-forms.tsx` (helper text follows the constant); `supabase/config.toml`; `paths.ts`; admin `(auth)` mfa pages; `mfa-form.tsx`, `mfa-setup.tsx`; set-password page;
users actions/page/list; problem catalog; new script; tests; README; constitution 01 and 04; new runbook.

### Level 2 — Dependent
- Every admin page and server action (they call `requireAdmin`). Risk: requires human approval — this is the
  security change itself; role checks are unchanged.
- Every admin RLS rule (through `tenant_ids_with_role`). Risk: requires human approval; pgTAP proves signed-out
  and wrong-role access still fail.
- `app/admin/problems/report/route.ts` (reads the session). Risk: low — checked in the build.

### Level 3 — Cascading
- Production: migration + release order + code removal (needs the owner's OK at release).
- Supabase dashboard settings: minimum length 8 (required, step 2 of the release order) and the leaked-password
  check (strongly recommended). Risk: owner action.

## Sources

- NIST SP 800-63B-4, Authenticator Assurance Levels (password-only = AAL1; MFA = AAL2) and password length
  (15 minimum when the password is the only factor; 8 minimum alongside another factor; check against breached
  password lists).
- OWASP Application Security Verification Standard 5.0, V6 Authentication (MFA for administrative access).
- CISA, "More than a Password" (MFA guidance).
- Supabase docs: Multi-Factor Authentication (AAL levels; `aal2` required to update a user with enrolled
  factors), Password security (leaked password protection).

## Build notes (2026-10-09)

- The code-step problem-catalog entries (`auth.verify_code`, `auth.start_code_setup`, `auth.confirm_code_setup`,
  `users.reset_sign_in_codes`) stay, marked "(retired)" without a function: the catalog must match the database
  both ways, and problems recorded before the change still show their labels.
- A password change refused because an account still has an old code now explains it ("This account still has
  an old sign-in code… Ask the site owner to remove it") instead of sending the person to a code page.
- `/admin/mfa` and `/admin/mfa/setup` are kept as pages that forward to the `next` page (dashboard by default);
  the admin middleware already sends anyone signed out to sign in.
- pgTAP: the old "an owner without a code cannot…" checks became "a password-only owner can…", plus "a token
  without a completed sign-in still cannot edit". The site-settings check now targets the fixture tenant's row
  (the old one targeted a row that owner could never change, so it proved nothing).
- Browser tests cover an account that still has an old authenticator (signs in without it), the reset link with
  an 8-character password, a 7-character refusal, the forwarding pages, and Users & roles.

