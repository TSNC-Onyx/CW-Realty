# CWR branded email templates — plan

Status: rev 3, 2026-10-08 (rev 1 audited B-, rev 2 A-/A; all fixes applied, rev 3 audited ALL A; owner decisions recorded 2026-10-08). **Owner decisions 2026-10-08:** look A, with "Charlie Ward Realty" beside the header logo (as in B); the email color exception to the design-token rule is approved. **Built 2026-10-08, PR #34.** After-merge steps and follow-ups are open items 14–17 in `docs/cwr-website-build-plan.md`.

## Goal

Every email the site sends (5 app emails + 2 sign-in emails) uses one shared Charlie Ward Realty layout — logo, brand colors, consistent footer — while the words, subjects, recipients, and sending behavior stay exactly as they are today.

## Scope

In scope — restyle the HTML version of these 7 emails:

| # | Email | Who gets it | Built in |
|---|---|---|---|
| 1 | New request alert | Staff on the alert list | `src/lib/email/messages.ts` `getNewRequestAlert` |
| 2 | "We got your message" copy | Website visitor | `getVisitorCopy` |
| 3 | Inbox reply | Website visitor | `getReplyEmail` |
| 4 | Test alert | Staff | `getTestAlert` |
| 5 | Problem digest (paused today) | Owner | `getProblemDigest` |
| 6 | Admin invite | New admin user | `supabase/templates/invite.html` (sent by Supabase Auth) |
| 7 | Password reset | Admin user | `supabase/templates/recovery.html` (sent by Supabase Auth) |

Out of scope:
- Wording, subjects, plain-text versions, recipients, reply-to, sender, MailerSend, retries, delivery log.
- New email types (Supabase "password changed" / "authenticator added" notices) — follow-up only.
- Changing how sign-in links are confirmed (`app/admin/auth/confirm/route.ts`) — pre-existing link-scanner risk logged as a follow-up needing owner approval (security change).
- Marketing email, web fonts, open/click tracking, unsubscribe links.
- Hosted SMTP and DNS (SPF/DKIM/DMARC).

## Architecture context

- App emails are strings built in `messages.ts` → `OutgoingEmail { subject, text, html }` → queue Worker → MailerSend (`process-alert-job.ts`, `problem-alerts.ts`). Only `html` changes.
- Sign-in emails are static files run by Supabase Auth through Go `html/template`. That engine removes HTML comments and escapes values by context; the hosted Dashboard has also been reported to strip `<head>` and Outlook-only (MSO) code (supabase/supabase#13764, #15408). Locally they load via `config.toml`; hosted copies are set in Dashboard → Authentication → Emails.
- Brand tokens live in `app/globals.css` (Style §11). `scripts/check-design-tokens.mjs` (CI `design:check`) fails on any raw hex color in `app/` or `src/` outside `globals.css`, so email colors need a sanctioned home (task 2).
- Logo: round black-and-gold CWR mark (`public/brand/cwr-logo-176.webp`). WebP does not show in Outlook for Windows, so email needs a PNG copy.

## Approach (shared by all three looks)

1. **One layout function** `getBrandedEmailHtml()` in `src/lib/email/layout.ts`. Inputs: `preheader` and `heading` (fixed text only), `bodyHtml` (already escaped), optional `button { label, url }`, `footerLines` (plain text — the layout escapes every entry itself, since the office phone comes from the database). Output: a full HTML document.
2. **Email-safe HTML rules** (caniemail, Litmus, Email on Acid):
   - No HTML comments and no MSO conditionals anywhere (Supabase removes them).
   - Outer table `width="600"` plus `max-width:600px; width:100%` (phones always fit; classic Outlook for Windows may draw the card wider than 600px — checked in task 11); all tables `role="presentation"`; all styles inline.
   - One small `<style>` in `<head>` for Apple Mail dark mode and phone widths — enhancement only. The email must look right with `<head>` removed (tested).
   - `lang="en"`, `meta color-scheme: light dark`, one `<h1>`, body links underlined.
   - Georgia for headings (Fraunces fallback), system sans stack for body; 16px text, 1.5 line height.
   - Button: gold table cell (`#e6bd35`) with ink text (`#141414`), 10.26:1 contrast, 44px+ tall, never an image. Button URLs must be `https://…` or the exact Supabase link variable; anything else throws.
   - Preheader hidden with `display:none; max-height:0; overflow:hidden; mso-hide:all`.
   - One image: logo, with alt "CWR Real Estate" (as on the website; the firm name is live text beside it, so screen readers don't hear it twice — changed during build 2026-10-08).
3. **Logo** `public/brand/cwr-logo-email.png` (176×176, transparent, shown at 56px). Its absolute URL is built in `layout.ts` from `SITE_URL` (`src/lib/site/navigation.ts`) — always the production address, never `{{ .SiteURL }}` (that is `127.0.0.1` locally, which Gmail cannot fetch).
4. **Builders** in `messages.ts` keep text, subject, `to`, and `replyTo` byte-for-byte; only `html` is wrapped. Escaping stays where it is. No function signatures change.
5. **Footer**: visitor emails (2, 3) — firm name, office phone (from live settings, already passed as `office`), website link. Staff/owner emails (1, 4, 5) — "Sent by the Charlie Ward Realty website". Sign-in emails (6, 7) — firm name + website only (static files can't read live settings, so no phone to go stale).
6. **Sign-in templates are generated, not hand-edited.** `src/lib/email/email-files.test.ts` (Vitest, so `@/` imports resolve). Write and preview modes use `it.runIf(process.env.EMAIL_WRITE === "1")` / `it.runIf(process.env.EMAIL_PREVIEW === "1")` and refuse to run when `CI` is set:
   - always: renders invite/recovery through the layout and fails if the committed `supabase/templates/*.html` differ (drift guard); asserts the confirm links are character-for-character today's; asserts no `<!--`, no `{{` other than `{{ .SiteURL }}` / `{{ .TokenHash }}`, and Go variables only inside `href`.
   - with `EMAIL_WRITE=1` (`npm run email:templates`): rewrites the two template files.
   - with `EMAIL_PREVIEW=1` (`npm run email:preview`): writes all 7 emails with sample, worst-case-long, and hostile input to git-ignored `email-preview/`.
7. **Colors in one sanctioned place**: `src/lib/email/brand-colors.ts` holds the 8 email colors; `check-design-tokens.mjs` gets one added allowed path for it (its header comment and Style §11.15 are updated in the same PR to name this single email exception — owner approved 2026-10-08); a test reads `globals.css` and fails if any value differs from its `--color-*` token.

## The three looks (owner picks one)

- **A — Letterhead card (CHOSEN 2026-10-08):** cream page, dark header band with the logo and "Charlie Ward Realty" beside it (Georgia, white `#ffffff` on dark `#121212`, live text — not part of the image, so it shows even when images are blocked), white card with a 4px gold top rule, serif heading, gold button, quiet footer. Closest to the website; the logo's black disc sits on dark so it never looks "boxed".
- **B — Quiet personal note:** white, small logo + firm name top-left, thin gold rule, reads like a letter, signature-style footer. Least "marketing" feel; most personal for replies.
- **C — Editorial banner:** full-width dark banner with logo and large white serif headline, gold underline, white body, dark footer. Strongest brand presence; most dark area, so the most dark-mode checking.

All three use the same function, tests, and rules; only blocks inside `layout.ts` differ.

## Task breakdown

1. **Snapshot first (own commit):** test locking today's `subject`, `text`, `to`, `replyTo` for all 5 app emails (`messages.test.ts`).
2. `src/lib/email/brand-colors.ts` + allowlist entry in `scripts/check-design-tokens.mjs` + token-match test.
3. `public/brand/cwr-logo-email.png` (from `cwr-logo-176.webp`, transparency kept).
4. `src/lib/email/layout.ts` + `layout.test.ts`: escaping (including a hostile `footerLines` value), `role="presentation"`, `lang`, one `<h1>`, alt, URL rule (non-https throws), every builder's button URL is https (`threadUrl`/`adminUrl` come from `SITE_URL`); with `<head>…</head>` stripped, no element relies on `class=` for layout or hiding (all key styles and preheader hiding inline); under 102 KB with a 20,000-character reply (inbox limit, `src/lib/admin/inbox/actions.ts:30`).
5. `messages.ts`: wrap each `html`; snapshot test from step 1 must still pass unchanged.
6. `email-files.test.ts`; regenerate `supabase/templates/invite.html` and `recovery.html`. `config.toml` stays identical (same paths, same subjects).
7. `package.json` scripts `email:templates`, `email:preview`; `email-preview/` in `.gitignore`.
8. `src/lib/redirects/lookup.test.ts`: add `/brand/cwr-logo-email.png → false`.
9. Docs: Style constitution "Email" pattern line; new runbook `docs/runbooks/auth-email-templates.md` (below).
10. Verify locally: `lint`, `typecheck`, `test`, `design:check`, `errors:check`, `test:e2e`; **required before merge** — `supabase start` + Mailpit: send a real invite and reset through Supabase's own engine and click through both; preview in light/dark at 375px and 600px.
11. Real-client pass on the chosen look before owner sign-off: send the preview set to Gmail (web + iPhone app), Outlook.com, classic Outlook for Windows (365/2021, Word engine), new Outlook for Windows, and Apple Mail (iPhone); check light and dark mode in Gmail iPhone, Outlook.com, and Apple Mail iPhone. Litmus/Email on Acid optional if the owner has an account.

## Runbook: hosted sign-in templates (owner + Claude, after merge)

0. **Deploy first**: after the production deploy, confirm `https://www.charliewardrealty.com/brand/cwr-logo-email.png` loads (200).
1. **Back up**: copy the current hosted invite and reset templates and subjects into a private note (not the repo).
2. **Check tracking**: open Dashboard → Authentication → SMTP, note which provider sends sign-in emails, and confirm click and open tracking are off there and in MailerSend (tracking rewrites sign-in links).
3. **Apply**: paste the two regenerated files into Dashboard → Authentication → Emails. Subjects unchanged.
4. **Read back**: reopen each template; compare to the repo file (Claude can diff a pasted copy). Any stripping → stop and roll back.
5. **Test**: owner sends themself a password reset to Gmail and to Outlook, and an invite to a throwaway address they control; open, check the look, click each link, confirm it works; then remove the throwaway admin user.
6. **Roll back**: paste the backup from step 1. App emails roll back with a git revert of the PR.

## Assumptions

- MailerSend accepts full HTML documents.
- Hosted templates are applied by Dashboard paste (no Management API token kept anywhere). If the owner prefers, a one-time Management API update with a token they enter in their own terminal is an alternative.
- Gmail's app may still invert colors; designs are made to look acceptable inverted, not to block it.
- `https://www.charliewardrealty.com/brand/*` is publicly fetchable by Gmail's image proxy (verified in step 11).

## DO NOT TOUCH

`src/lib/email/mailersend.ts`, `send-email.ts`, `src/lib/jobs/*`, `worker.ts`, `wrangler.jsonc`, `supabase/config.toml`, `supabase/migrations/*`, `app/admin/auth/confirm/route.ts`, `src/lib/admin/auth-actions.ts`, `src/lib/admin/users/actions.ts`, `scripts/invite-admin.mjs`, existing `public/brand/*` files, `app/globals.css`, website components, any email subject or plain-text wording. `scripts/check-design-tokens.mjs`: only the one allowlist entry.

## Downstream Impact Analysis

### Level 1 — Direct
Files: `layout.ts`, `brand-colors.ts`, `email-files.test.ts` (new); `messages.ts`; `supabase/templates/invite.html`, `recovery.html`; `public/brand/cwr-logo-email.png` (new); `check-design-tokens.mjs` (one allowlist line); `package.json`, `.gitignore`; tests; docs.
Contracts: `OutgoingEmail.html` content only; types and signatures unchanged.

### Level 2 — Dependent
`process-alert-job.ts`, `problem-alerts.ts`, `deliveries.ts` pass `html` through untouched; admin "Retry" rebuilds the email (gets the new look — expected). Supabase Auth invite/recovery send; `/admin/auth/confirm` consumes the unchanged link. CI `design:check`.
Risk: low; hosted templates require plan entry (runbook above, owner step).

### Level 3 — Cascading
MailerSend → inboxes (Gmail, Outlook, Apple Mail); spam scoring; Gmail clipping; Gmail image proxy → Cloudflare; corporate link scanners → one-time sign-in links.
Risk: low; link scanners are pre-existing and logged as a follow-up needing owner approval.

## Edge cases (most → least critical)

| # | Edge case (cause → effect → deeper effect) |
|---|---|
| 1 | Visitor text lands in a nicer-looking email → it looks more trustworthy → it could be used to phish someone using CWR's name. |
| 2 | Sign-in link changed by a typo or escaping → invite/reset link fails → no one can get into the admin portal. |
| 3 | Supabase strips comments, `<head>`, or Outlook code → layout falls apart → sign-in emails look broken or untrustworthy. |
| 4 | A stray `{{` or a Go variable in the wrong spot → Supabase can't read the template → invite and reset emails stop sending. |
| 5 | Hosted templates not updated or pasted wrong → hosted and repo differ → sign-in emails look old or broken with no warning. |
| 6 | Email security scanners "click" sign-in links (pre-existing) → the one-time link gets used up → the person sees "link expired". |
| 7 | MailerSend click tracking turned on → sign-in links get rewritten → links may fail. |
| 8 | Raw colors in email code → CI design check fails → every future merge is blocked. |
| 8b | A non-https button URL reaches the layout → the whole alert job stops before any delivery is recorded → no one gets the email and it lands in the dead-letter path, not the failed-delivery list. |
| 9 | Images blocked or logo fetch blocked by Cloudflare → no logo → email must still read well. |
| 10 | Outlook for Windows ignores modern CSS → layout collapses → looks unprofessional to many business clients. |
| 11 | Gmail drops the `<style>` block (non-Gmail accounts) or inverts colors → dark mode/phone tweaks vanish → text could be hard to read. |
| 12 | Very long owner reply → over 102 KB → Gmail hides the end ("Message clipped"). |
| 13 | Office phone changes in admin → static templates go stale → wrong number in emails. |
| 14 | Branded design looks like marketing → Promotions tab or spam → alerts and replies get missed. |
| 15 | Screen reader reads layout tables as data → confusing for blind users → accessibility complaint. |
| 16 | Small phone screen → button or text too small → hard to tap. |

## Solutions (same numbering)

| # | Solution |
|---|---|
| 1 | Keep today's escaping; layout takes only pre-escaped HTML; heading/preheader are fixed text; button URLs must be `https://`; hostile-input tests. |
| 2 | Links copied exactly and locked by test; Mailpit click-through of both flows before merge. |
| 3 | No comments or MSO code (test-enforced); fixed 600px table; layout tested with `<head>` removed. |
| 4 | Test allows only `{{ .SiteURL }}` and `{{ .TokenHash }}`, only inside `href`; real Supabase send in Mailpit. |
| 5 | Runbook: backup, paste, read-back compare, self-test, rollback. Repo files are generated with a drift test. |
| 6 | Not changed here (security change). Logged as follow-up: confirm page with a "Continue" button so scanners can't use the link. |
| 7 | Runbook step 2 confirms tracking is off before applying. |
| 8 | Colors live in one file allowed by the check, with a test tying each value to `globals.css`. |
| 8b | Can't happen today: every button URL comes from the fixed `SITE_URL` constant, and a test proves each builder makes an https URL. If it ever did, the existing dead-letter handling logs it (no job code changes). |
| 9 | All words are live text, button is HTML, logo has alt text; step 11 confirms Gmail loads the logo. |
| 10 | Tables, inline styles, width attributes, table-cell button, PNG logo; checked in Outlook desktop. |
| 11 | `<style>` is extra only; inline styles carry the design; no gold text on light; contrast checked in inverted preview. |
| 12 | Layout about 6 KB; test proves a 20,000-character reply stays under 102 KB. |
| 13 | App emails read live settings; sign-in emails show no phone. |
| 14 | One image, mostly text, no tracking, same sender and plain-text part. |
| 15 | `role="presentation"`, `lang="en"`, one `<h1>`, meaningful alt. |
| 16 | Fluid width, 16px text, 44px button, full-width under 480px. |

## No-regression guarantees

- Subjects, plain text, recipients, reply-to, sender, retries, delivery log: unchanged and snapshot-locked in a commit before any change.
- `config.toml` unchanged (same template paths and subjects).
- All existing unit, pgTAP, e2e, design, and error checks pass; only new cases added.
- No database migration, no Worker or config change, no new dependency.

## Why not a library

React Email adds React rendering to the Worker bundle (size limits) and can't produce Supabase's static files directly; MJML adds a heavy compiler for one layout. One template-string function fits the existing code and keeps the footprint small.

## Follow-up ideas (not in this plan)

- Sign-in confirm page with a button (fixes edge case 6) — security change, needs owner approval.
- Supabase security notices (password changed, authenticator added) using the same layout.

## Sources

- Can I email — WebP: https://www.caniemail.com/features/image-webp/
- Can I email — `<style>`: https://www.caniemail.com/features/html-style/
- Email client rendering 2026: https://dev.to/mailpeek/the-complete-guide-to-email-client-rendering-differences-in-2026-243f
- Email accessibility 2026: https://emfluence.com/blog/email-accessibility-and-design-best-practices-in-2026
- Dark mode email: https://www.htmlemailbuilders.com/blog/dark-mode-email-design
- WCAG 2.2 contrast: https://www.w3.org/TR/WCAG22/#contrast-minimum
- Supabase auth email templates: https://supabase.com/docs/guides/auth/auth-email-templates
- Supabase template stripping reports: https://github.com/supabase/supabase/issues/13764, https://github.com/supabase/supabase/issues/15408

---

# Phase 2 — replace every Supabase default email (rev 6, 2026-10-10)

Owner asked 2026-10-10: Supabase's own default emails must never be sent; ours must be used for every Supabase email. Plan only — waits for owner approval. Audit: rev 4 graded B (7 fixes), rev 5 A- (1 fix), rev 6 ALL A.

## Findings

Supabase Auth has 13 email types (https://supabase.com/docs/guides/auth/auth-email-templates). Only 2 use our templates today. Checked against the docs, the CLI v2.118 keys, and the Supabase Auth source.

| # | Supabase email | Can it be sent today? | Why |
|---|---|---|---|
| 1 | Invite user | Yes — site | Owner invites an admin (ours, Phase 1) |
| 2 | Reset password | Yes — site | "Forgot password" (ours, Phase 1) |
| 3 | Magic link / sign-in code | Yes — direct API call | Anyone with the public key and a Quick Check token can request one for an existing admin; the site never offers it |
| 4 | Confirm sign-up | Yes — direct API call | "Resend sign-up" works for an invited admin who hasn't accepted yet, even with sign-ups off (`resend.go` has no sign-ups-off check). The default carries a working link |
| 5 | Change email address | Yes — direct API call | Needs a signed-in admin with sign-in codes; the site has no page for it |
| 6 | Reauthentication code | Yes — direct API call | Needs a signed-in admin; the site doesn't use it |
| 7 | Password changed (notice) | Only if switched on | Fires on every invite acceptance and reset |
| 8 | Authenticator added (notice) | Only if switched on | Fires on sign-in code setup |
| 9 | Authenticator removed (notice) | Only if switched on | Fires when sign-in codes are removed |
| 10 | Email address changed (notice) | Only if switched on — and can't fire while #5 has no link | — |
| 11 | Phone number changed (notice) | No | No phone sign-in |
| 12 | Sign-in method linked (notice) | No | No Google/Apple sign-in |
| 13 | Sign-in method removed (notice) | No | Same |

Notices are off unless switched on per project; the hosted settings can't be read from the repo, so the script reports them first.

## Approach

1. **Brand all 13** through the same layout (`src/lib/email/auth-templates.ts` → `supabase/templates/*.html`), with our own subjects. Nothing stays on a Supabase default, so a later settings change can't bring one back.
2. **No working link or code for flows the site doesn't offer (3, 4, 5, 6).** Each says what was asked, that the website doesn't use it, and to ignore it or tell the office. Least privilege: a link would only help someone calling Supabase directly.
3. **Close the matching door in the site:** remove `"email"` from `ACCEPTED_TYPES` in `app/admin/auth/confirm/route.ts`, so magic-link and sign-up links can't sign anyone in even if one is ever sent. Only invite and reset links are accepted. Test added. (Security change — owner approval asked below.)
4. **Notices (7–13)** use only the values Supabase gives each (e.g. `{{ .Email }}`, `{{ .OldEmail }}`, `{{ .FactorType }}`), which its engine escapes, and say to contact the office if it wasn't you. OWASP ASVS 5.0 V6.3 and NIST SP 800-63B both call for notices when a password or authenticator changes.
5. **Notice on/off is the owner's choice.** Recommended: on for 7, 8, 9, 10; 11–13 stay off (can't happen) but branded.
6. **Local config** (`supabase/config.toml`): `[auth.email.template.{confirmation,magic_link,email_change,reauthentication}]` and `[auth.email.notification.{password_changed,email_changed,phone_changed,identity_linked,identity_unlinked,mfa_factor_enrolled,mfa_factor_unenrolled}]` with `enabled`, `subject`, `content_path`. Invite/recovery unchanged. Locally, `enabled = true` for password_changed, mfa_factor_enrolled, mfa_factor_unenrolled and email_changed so the local sends in edge case 8 run; phone_changed and the two identity notices stay `false`. The hosted on/off follows owner question 1 and is set by the script, not config.toml.
7. **Hosted rollout — recommended: one-time script** `scripts/push-auth-email-templates.mjs`, run by the owner in their own terminal (with Claude on hand):
   - **Token:** a scoped Supabase access token — this project only, Auth Config read-write only, shortest expiry — typed into a hidden prompt (never a command argument or environment variable, so it isn't saved in shell history). The owner deletes it in Supabase right after.
   - **Pre-checks:** reads the hosted settings and reports sign-ups on/off, double-confirm, and which notices are on; stops if sign-ups are on.
   - **Backup:** saves only the 33 `mailer_*` email keys (no SMTP password or other secrets) to a git-ignored file readable only by the owner (mode 0600).
   - **Dry run first:** `--dry-run` prints a key-by-key list of what will change; the real run asks "Apply?" before sending.
   - **Apply:** `PATCH /v1/projects/{ref}/config/auth` with exactly the 33 email keys (`mailer_subjects_*`, `mailer_templates_*_content`, `mailer_notifications_*_enabled`). Templates and subjects go in the same request as the notice switches.
   - **Check:** reads back and fails if any of the 33 differs from the repo.
   - **Undo:** `--restore <backup file>` puts the saved 33 keys back.
   - Never `supabase config push` (it would push the local site URL too).
   **Fallback — manual paste:** runbook checklist for all 13 templates and subjects first, notices switched on last, then a test send for each type that can fire.
8. **Tests:** every type has a generated file (drift guard); each file uses only its allowed values, only in allowed spots; no `<!--`; no Supabase default wording; config.toml lists all 13; the script's request body has exactly the 33 documented keys (one shared constant) and each subject/content pair maps to its own generated file; confirm route refuses `type=email`.

## Edge cases (most → least critical)

| # | Edge case | Solution |
|---|---|---|
| 1 | Notices are already on in hosted Supabase, so plain default emails go out after a password set or authenticator setup. | All 13 branded; the script reports what's on before changing anything. |
| 2 | Someone triggers "resend sign-up" for an invited admin who hasn't accepted yet; the default email has a working sign-in link. | Our version has no link, and the confirm page stops accepting that link type. |
| 3 | The backup file holds secrets (SMTP password) and leaks. | Backup keeps only the 33 email keys, in a git-ignored, owner-only file. |
| 4 | Someone requests a magic link for an admin email and gets a working sign-in link. | No link in our version; confirm page refuses it; Quick Check is already required to ask. |
| 5 | The access token leaks. | Scoped to this project's auth settings, short expiry, typed into a hidden prompt, deleted after the run. |
| 6 | The script changes other auth settings (site URL, redirects, sign-ups) and breaks sign-in. | Request body is exactly the 33 email keys (tested); dry run first; backup and `--restore`. |
| 7 | A paste or script mistake leaves one type on the default or broken. | Script reads back all 33; manual path has a per-type checklist, notices last. |
| 8 | A template uses a value Supabase doesn't give that type, so the email fails to send. | Per-type allowed-value test; real local send through Supabase for each type that can fire locally (2–9). |
| 9 | "Password changed" fires on every invite acceptance and reset, which could worry people. | Wording: "Your password was set or changed." |
| 10 | Supabase adds a new email type later and it uses the default. | Test lists the 13 known types; runbook says to check the Dashboard's email list after Supabase announcements. |
| 11 | PR #34 is 19 commits behind `build1`. | Bring it up to date first; rerun every check. |

## No-regression guarantees

- Invite and reset emails, links and subjects unchanged; app emails untouched.
- The only site code change: the confirm page stops accepting `type=email` links. No current site flow sends one (only invite and reset exist), proven by tests and the e2e suite.
- Only email settings change in hosted Supabase, with a backup and a restore command.

## Owner questions

1. Turn on security notices 7–10 (password set/changed, authenticator added/removed, email changed), branded? Recommended: yes.
2. Hosted rollout: the one-time script (recommended) or manual paste of 13 templates?
3. OK to make the sign-in link page accept only invite and reset links (security change)? Recommended: yes.
