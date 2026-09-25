# Phase 3 — Admin Portal — Plan

Status: **built** (2026-09-25) on branch `phase-3-admin-portal` (stacked on `phase-2-data-pages`).
Parent plan: `docs/cwr-website-build-plan.md` (Phase 3, tasks 12–14; role table; retention).

## Goal

Owners and managers sign in with a password plus an authenticator-app code, then edit listings (with photos), team members, and contact/footer details, restore items from the trash, and (owners) manage who has access — all from a phone or a computer, with every change logged.

## Scope

**In scope**
- Task 12: `/admin` sign-in (email + password), TOTP authenticator enrollment and verification (every role), invite and password-reset links, 30-minute inactivity timeout and 12-hour maximum session (NIST SP 800-63B AAL2), role gating per the parent plan's role table.
- Task 13: dashboard cards; editors for Listings, Team, Contact & Footer; fixed Save bar, toasts announced to screen readers, errors that stay and name the field, unsaved-changes warning, listing preview before publish, Undo instead of confirm pop-ups, 30-day trash (restore: owner + manager; delete forever: owner).
- Task 14: photo upload pipeline — resized and encoded to AVIF + WebP in the browser, uploaded through short-lived signed URLs, alt text required, stored in the Phase 2 photo file layout.
- Users & roles screen (owner): invite, change role, remove, reset someone's authenticator.
- Supporting: public pages move into an `app/(site)` route group so the admin area has its own layout; CI browser job runs against a local database with test fixtures.

**Out of scope**
- Inbox, notifications, unread count (Phase 4), chatbot policy (Phase 5). Their dashboard cards are not shown yet.
- Bot protection (Turnstile) on the sign-in form — added with the other public endpoints in Phase 4; Supabase Auth's built-in sign-in rate limits apply meanwhile.
- Drag-and-drop reordering (Admin §3 allows "drag **or** up/down buttons"; up/down buttons are keyboard- and phone-friendly).

## Resolved decisions

| # | Question | Decision | Source |
|---|---|---|---|
| 1 | Session library | `@supabase/ssr` 0.12.7 cookie sessions; middleware refreshes the session on `/admin` requests | Parent plan architecture |
| 2 | MFA | TOTP authenticator app, required for all roles before any admin screen (database already requires `aal2`) | Infra §2, Admin §7 |
| 3 | Inactivity / maximum session | 30 minutes idle, 12 hours total, then sign-in again — NIST SP 800-63B AAL2 reauthentication limits. Enforced on the server (cookies checked in middleware) and in the open tab (idle timer) | Admin §7 |
| 4 | Creating accounts | Sign-up stays off. Owners invite people by email; the invite link leads to "set your password", then authenticator setup. The first owner is created with `npm run admin:invite` (service-role script) | Infra §2 least privilege |
| 5 | Photo processing | In the editor's browser: decode, resize to 640/1280/1920 (never upscale), encode AVIF (jSquash, speed 8) and WebP (jSquash) inside a Web Worker. Admin pages alone allow `'wasm-unsafe-eval'` in the CSP. Re-encoding also strips camera location data | Style §8, §11.8; Admin §2 |
| 6 | Upload security | The server checks role and record, then issues one-time signed upload URLs (service role, server-only) for that photo's folder; the photo row is saved only after every file is confirmed in storage | Infra §2 |
| 7 | Atomic reorder | New `cwr.move_item(table, id, direction)` swaps two sort orders in one transaction (security invoker, so RLS applies) | Infra §3 transactional |
| 8 | Retry safety | "Create" actions (listing, team member, invite) carry an idempotency key; a retried submit returns the first result | Infra §3 |
| 9 | Deleting | "Move to trash" + an Undo button in the toast; "Delete forever" (owner, in Trash) removes the row and its photo files | Admin §1, §7 |
| 10 | Unsaved changes | Browser warning on tab close/reload; in-app links ask "Leave without saving?" | Admin §1 |
| 11 | Preview | Listings: "Preview" shows the public page layout for drafts. Team and contact changes go live on Save (Admin §3 "update the live grid instantly") with a "View on website" link | Admin §1, §3 |
| 12 | Where admin audit shows | Every write already lands in `cwr.audit_log` via triggers; the app sends `x-request-id` so entries trace to requests | Infra §4 |
| 13 | Contact names / footer text | Shown on the Contact page ("Ask for …") and as an extra footer line when filled in | Admin §4 |
| 14 | Admin look | Same design tokens and components as the public site; `noindex`; own header with sign-out | Style §11.15, SEO |

## Architecture context

- `app/(site)/…` public pages (unchanged URLs) with the public layout; `app/admin/…` admin pages with the admin layout; root `app/layout.tsx` keeps `<html>`, fonts, tokens.
- Server clients: `src/lib/supabase/server-client.ts` (user session, RLS applies) and `src/lib/supabase/service-client.ts` (`server-only`, service role — invites, signed upload URLs, storage deletes, user emails).
- Guard: `requireAdmin({ roles })` in every admin page and server action (service-layer tenant + role check, in addition to RLS).
- New env/secret: `SUPABASE_SERVICE_ROLE_KEY` (Worker secret; never `NEXT_PUBLIC_`).

## Task breakdown

1. Route groups: move public pages, layout, error, not-found into `app/(site)`; `app/(site)/[...missing]/page.tsx` keeps the site 404 inside the site layout.
2. Migration `20260925001200_cwr_move_item.sql`: `cwr.move_item()`. pgTAP `080-move-item.test.sql`.
3. Auth: server/service clients; middleware session refresh + idle/absolute cookies for `/admin`; pages `/admin/login`, `/admin/mfa`, `/admin/mfa/setup`, `/admin/forgot-password`, `/admin/set-password`, route handlers `/admin/auth/confirm`, `/admin/logout`; email templates (`supabase/templates/*.html`) using `token_hash` links; `config.toml` auth updates.
4. Admin shell: layout, nav, sign-out, idle timer, toast provider, form kit (fields, fixed Save bar, field errors, unsaved-changes guard), error mapping from database errors to plain messages.
5. Dashboard.
6. Contact & Footer editor (+ public display of contact names and footer text).
7. Team editor: list (order, visibility, trash + Undo), create/edit form, portrait upload.
8. Listings editor: list (order, status, publish), create/edit form, photo manager (upload, alt text, order, remove + Undo), preview page; shared `ListingDetail` component with the public page.
9. Photo pipeline: `src/workers/photo-encoder.ts` (built separately by `scripts/build-photo-encoder.mjs` with esbuild into `public/photo-encoder/`, because Next.js's bundler stalls on the codec's worker code), `src/lib/admin/photos/encode-photo.ts`, server actions for signed URLs and confirming photos.
10. Trash (restore / delete forever with file cleanup).
11. Users & roles (+ `scripts/invite-admin.mjs`).
12. Tests: unit (guards, mappers, schemas, slugging, session timing), pgTAP, Playwright admin flows (sign-in + MFA with a generated TOTP code, each editor, role gating, timeout). CI browser job: start Supabase, import fixture content, run everything.

## Assumptions

- The hosted project's Auth settings (site URL, redirect URLs, email templates, SMTP via MailerSend) are applied at launch from the runbook; locally they come from `config.toml`.
- Supabase's default email sender is enough for local testing (Mailpit); production email needs MailerSend SMTP (Phase 4 sets it up).

## DO NOT TOUCH

Parent-plan list; migrations up to `20260925001100`; pgTAP `000`–`070`.

## Edge cases (most → least critical) and solutions

| # | Edge case | Solution |
|---|---|---|
| 1 | Someone signs in with only a password (MFA skipped) | Every admin page and action requires an `aal2` session; the database itself returns nothing to `aal1` sessions |
| 2 | A removed staff member keeps an open session | Access is checked against memberships on every request and every database call; removal takes effect immediately |
| 3 | The only owner is demoted or removed | The existing database guard refuses it; the screen explains why |
| 4 | Service-role key leaks to the browser | Only imported from a `server-only` module; build fails if a client file imports it |
| 5 | Double-clicking Save / Create | Button locks while saving; create actions are idempotent |
| 6 | A photo upload is interrupted | The photo row is written only after all files are confirmed; nothing half-made shows on the site |
| 7 | Live listing loses its last photo | Database refuses; message: "A live listing needs at least one photo" |
| 8 | Two editors change the same record | Last save wins; each save is logged with who and when |
| 9 | Phone photo is huge, sideways, or holds GPS location | Decoded with its orientation, resized before encoding, re-encoded (location removed) |
| 10 | Unsupported file (HEIC on a desktop browser, PDF) | Clear message: "Use a JPEG, PNG, or WebP photo" |
| 11 | Session times out while typing | Idle timer warns at 28 minutes; at 30 it signs out and says why |
| 12 | Lost authenticator phone | Owner uses "Reset authenticator" for that person; a sole owner uses the runbook script |
| 13 | Slug already used | Field error "Another listing already uses this web address" |

## Downstream Impact Analysis

### Level 1 — Direct
Route-group move of public pages (URLs unchanged), `middleware.ts`, CSP helper, new admin pages/actions/components, one migration, `config.toml`, email templates, CI workflow, scripts, tests.

### Level 2 — Dependent
- Public pages: same URLs, same markup; e2e suite re-run guards against regressions.
- CSP: admin-only `'wasm-unsafe-eval'`; public pages unchanged. Risk: security-sensitive but within the approved architecture (auth + admin were approved); scoped to `/admin`.
- Auth settings (redirect URLs, templates) must be mirrored on the hosted project. Risk: requires plan entry (runbook, Phase 7).

### Level 3 — Cascading
- Phase 4 inbox/notifications and Phase 5 policy editor reuse the admin shell, guard, form kit, and toasts.
- Production email delivery for invites and resets depends on SMTP (Phase 4 MailerSend). Until then, invites work locally only. Risk: low; noted for launch.

## Launch notes (for the Phase 7 runbook)

- Hosted Auth settings must match `supabase/config.toml`: email provider on, sign-ups off, Site URL `https://www.charliewardrealty.com`, the two email templates in `supabase/templates/`, SMTP through MailerSend (Phase 4).
- Cloudflare Worker secret `SUPABASE_SERVICE_ROLE_KEY` (never a `NEXT_PUBLIC_` variable).
- First owner: `npm run admin:invite -- owner@example.com owner` with the hosted URL and service-role key.
- A sole owner who loses their phone: an operator deletes their factor with the service role (`auth.admin.mfa.deleteFactor`), then they set up a new one.
- Accepted risk until a paid Supabase plan: the 30-minute / 12-hour limits are enforced by the website; a stolen refresh token used directly against the Supabase API is limited only by Supabase's own session settings (`[auth.sessions]` timebox / inactivity need the Pro plan).
- Nightly workflow "Clean up unused photo files" needs the same secrets as the import.

## Verification (2026-09-25)

| Check | Result |
|---|---|
| Unit tests | 134 passed |
| Database tests (fresh database) | 99 passed (9 files, incl. new `080-move-item`) |
| Playwright, CI setup (fresh database + test content) | 216 passed — incl. sign-in with a generated authenticator code, role gating, timeout, photo upload through the browser encoder, publish/preview/trash/undo, invites, and WCAG 2.2 AA + design checks on every admin screen at phone and desktop sizes |
| lint, typecheck, db:check, db:lint, design:check, Workers build | pass |
| Independent security review | 1 high (idle limit could be skipped when the activity cookie expired), 2 medium (password step relied on the page; old photo files never deleted), 7 low — all fixed except the paid-plan session item (accepted risk above); two follow-up checks found 3 more (cleanup paging, portrait Undo, imported photo folder layout) — fixed and confirmed. New migration `20260925001300` + pgTAP `090` audit sign-in code resets |
