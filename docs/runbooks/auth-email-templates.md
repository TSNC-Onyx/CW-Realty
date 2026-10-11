# Runbook: hosted sign-in and account emails

Governs: every email Supabase Auth sends (13 types). Design: `docs/cwr-branded-email-templates-plan.md` (Phase 1 and Phase 2).

The repo files in `supabase/templates/` are generated from `src/lib/email/auth-templates.ts` (`npm run email:templates`; a unit test fails if they drift). Local Supabase reads them through `supabase/config.toml`, which also holds each subject and which security notices are on. The hosted project does **not** read the repo: after any change, copy the settings over with the script below.

| Email | Sent when | Has a working link? |
|---|---|---|
| Invite | Owner invites an admin | Yes — set a password |
| Reset password | "Forgot password" | Yes — choose a password |
| Sign-up confirmation, sign-in link, email change, verification code | Only if someone calls Supabase directly | No — the site doesn't offer these |
| Password set or changed (on) | Invite accepted, password reset | Reset-password button |
| Email changed (on) | Sign-in email changed | No |
| Sign-in code added / removed (on) | Old codes removed, or one added | No |
| Phone changed, sign-in method added / removed (off) | Can't happen today | No |

## When to run

After a merge to `build1` that changes `supabase/templates/` or the email sections of `supabase/config.toml`, once the production deploy has finished.

## Steps (with the script — recommended)

0. **Logo is live.** Open `https://www.charliewardrealty.com/brand/cwr-logo-email.png`. It must show the round CWR logo. If not, stop: the deploy hasn't finished.
1. **Check link tracking.** In Supabase → Authentication → SMTP Settings, note which service sends the emails. In that service (MailerSend), click tracking and open tracking must be **off** (tracking rewrites sign-in links).
2. **Make a short-lived token.** Supabase → Account → Access Tokens → new token: this project only, **Auth Config** read and write only, shortest expiry.
3. **Dry run.** In a terminal (any folder inside the project): `node scripts/push-auth-email-templates.mjs --dry-run`. Paste the token when asked (it stays hidden). It shows:
   - sign-ups off (must say yes — it stops otherwise), email changes confirmed on both addresses, which notices are on now;
   - each of the 33 email settings that would change.
4. **Apply.** `node scripts/push-auth-email-templates.mjs`, paste the token, read the list, type `yes`. It saves the current email settings to `.auth-email-backup-<time>.json` (only the 33 email settings, no secrets; only you can read it; never committed), applies, reads back, and says "all 33 email settings match".
5. **Delete the token** in Supabase → Account → Access Tokens.
6. **Test.**
   - "Forgot password" for your own account: check the email in Gmail and Outlook and click the button. It must open "Choose a password". After saving, a "Your password was set or changed" email should arrive.
   - On Admin → Users, invite a throwaway address you control, check the email, click the button, set a password, then remove that user.
7. **Undo if needed.** `node scripts/push-auth-email-templates.mjs --restore .auth-email-backup-<time>.json` (new token if the old one was deleted).

## Steps without the script (fallback)

1. Back up: copy each email's subject and body from Supabase → Authentication → Emails into a private note.
2. Paste all 13 templates and subjects first (file and subject for each are in `supabase/config.toml`).
3. Switch notices on **last**, and only these: Password changed, Email address changed, MFA factor enrolled, MFA factor unenrolled.
4. Reopen each one and compare it with the repo file (Claude can check a pasted copy), then test as in step 6 above.

## Keeping it complete

Supabase occasionally adds new email types. After a Supabase announcement about Auth emails, open Supabase → Authentication → Emails and compare the list with the 13 in the table above. A new type would use Supabase's default look until it's added to `src/lib/email/auth-templates.ts`, `supabase/config.toml`, and the script.

## Rolling back the app emails

The five website emails (new request, visitor copy, reply, test alert, problem digest) are built in the app. Reverting the pull request and deploying restores the old look; nothing in the database changes.
