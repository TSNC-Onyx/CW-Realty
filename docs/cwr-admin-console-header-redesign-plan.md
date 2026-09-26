# Admin Console & Header Redesign — Plan

Status: **built** (2026-09-25), **approved by owner** (2026-09-25) from the mockup https://claude.ai/artifact/GVBwWShwiS9qbXeS9XkFwA (version 3). Gold logo ring confirmed; Sign out sits in the desktop top-right corner, email and role at the bottom of the sidebar.
Branch: `claude/admin-console-header-redesign-6a6ccd`.

## Goal

Every header on the site is dark with a larger gold-ringed logo, the admin portal uses a left sidebar with a slim top bar and a new at-a-glance dashboard, and admin pages no longer crash when a server setting is missing.

## Scope

**In scope**
1. Inbox failure: pages that read teammate emails (Inbox list, Inbox thread, Users & roles) load without the service-role key; an owner-only dashboard notice names the missing setting; a friendly admin error page replaces the blank crash.
2. Public header (every public page): dark background, white text, gold current-page bar, dark dropdowns, gold "Contact us", dark "Menu" button; mobile header 62px.
3. Logo: 75px desktop / 55px phone in headers; 2% edge trim and a 2px gold ring on every placement (all placements now sit on dark); header logo uses the 176px source for sharp 2× screens.
4. Admin frame: sticky dark top bar (logo → admin dashboard, "CWR Real Estate / Admin", area breadcrumb, "View website" in a new tab, Sign out); dark grouped sidebar at 1024px+ (Daily / Website / Settings, icons plus words, gold current bar, unread count capped at 99+) with email and role at the bottom; below 1024px a 62px bar with logo, Inbox shortcut, and Menu button opening a full-screen dark menu with the account and Sign out at the bottom.
5. Admin sign-in pages: the same dark top bar with the logo (they had none).
6. Dashboard: greeting and date, owner setup notice, dark "Today" strip (4 numbers for owners/managers, 2 for staff, action-needed numbers in gold), latest 5 messages, role-aware quick actions, compact 4-per-row area cards.
7. Constitution edits approved with the mockup: Style §11.7, §11.9, §11.13, plus the §11.1 `dark` token row's "Use" column (it now lists headers and the admin sidebar, a direct consequence of the approved dark headers).

**Out of scope**
- Adding the Cloudflare secret itself (owner action; secrets are never typed by the agent). Steps go in the owner summary.
- Record-level breadcrumbs ("Inbox › Maya Johnson"): pages already carry their own H1 and back links; the breadcrumb shows the area only.
- Chat panel 32px logo (not a header), footer layout, action bar, any database migration.
- Making chat logging / photo uploads / invites work without the key (they need it by design; the owner notice covers them).

## Resolved decisions

| # | Question | Decision | Source |
|---|---|---|---|
| 1 | Inbox root cause | `SUPABASE_SERVICE_ROLE_KEY` missing in the production Worker. Supabase edge logs 2026-09-26 01:14:24Z: thread list and memberships queries return 200, then no `/auth/v1/admin/users` call is ever made → `createServiceClient()` threw `MissingDatabaseSettingsError` | Logs |
| 2 | Fix | Owner adds the Worker secret; code checks `isServiceAccessConfigured()` before the email lookup and falls back to "Team member" | Infra §3 fail gracefully |
| 3 | Where Sign out lives | Desktop: top-right of the top bar. Phone: bottom of the menu | Owner, 2026-09-25 |
| 4 | Logo ring | 2px gold border inside the circle wrapper; image scaled 104% so the file's light fringe is clipped | Owner, 2026-09-25 |
| 5 | Admin logo link | `/admin` inside the portal; public pages and sign-in pages link `/` | Mockup edge case 8 |
| 6 | Sidebar breakpoint | 1024px (desktop) and up; tablets and phones use the Menu | Style §11.4 breakpoints |
| 7 | Sign out with unsaved edits | Already covered: Sign out is a full-page form post, so the existing `beforeunload` warning fires | `use-unsaved-changes.ts` |
| 8 | Font size on the dashboard | Cards use 14–15px text; the 14px minimum still holds | Style §11.2 |
| 9 | Unread accessible name | Stays "Inbox (N new)" (sr-only), visible badge is the number; e2e relies on it | `inbox.spec.ts` |

## Architecture context

- Public frame: `app/(site)/layout.tsx` → `SiteHeader` (`Logo`, `DesktopNav`, `MobileMenu`).
- Admin frame: `app/admin/(portal)/layout.tsx` (server; `requireAdminPage`, unread count) → new `AdminTopBar`, `AdminSidebar`, `AdminMobileMenu` built from `ADMIN_AREAS` in `src/lib/admin/navigation.ts`.
- Dashboard: `app/admin/(portal)/page.tsx` + `src/lib/admin/dashboard.ts` (counts through the RLS session client).
- Service-role access: `src/lib/supabase/service-client.ts`, used by inbox/users queries after `requireAdmin`.
- Styling: Tailwind v4 with the single token file `app/globals.css`; `.tone-dark` switches the focus ring to white.

## Task breakdown

1. `src/lib/supabase/service-client.ts`: export `isServiceAccessConfigured()`.
2. `src/lib/admin/inbox/queries.ts`: `fetchTeammates` returns "Team member" labels when not configured; add `fetchLatestThreads(admin, limit)` and `fetchOldestNewThreadDate(admin)`.
3. `src/lib/admin/users/queries.ts`: same guard in `fetchAdminUsers`; sign-in code status becomes "on" / "not set up" / "unknown" so the page never claims codes are missing when it simply cannot check (`user-list.tsx`).
4. `app/admin/(portal)/error.tsx`: friendly error with "Try again" and "Go to the dashboard".
5. `src/components/layout/logo.tsx`: sizes 75/55 (header), trim + ring, `href` prop (default `/`).
6. `app/globals.css`: `--header-height` 62px on phones.
7. Public header: `site-header.tsx`, `desktop-nav.tsx`, `mobile-menu.tsx` → dark tone.
8. `src/lib/admin/navigation.ts`: `group` on each area + `ADMIN_AREA_GROUPS`; `getAreaForPath(pathname)`.
9. New `src/components/admin/frame/`: `admin-area-icons.tsx`, `unread-badge.tsx`, `admin-nav-links.tsx`, `admin-top-bar.tsx`, `admin-sidebar.tsx`, `admin-mobile-menu.tsx`, `admin-breadcrumb.tsx`, `sign-out-button.tsx`, `admin-account.tsx`. Remove `src/components/admin/admin-nav.tsx`.
10. `app/admin/(portal)/layout.tsx`: new frame.
11. `app/admin/(auth)/layout.tsx`: dark top bar with logo.
12. Dashboard: `src/lib/admin/dashboard.ts` (Today strip figures), `app/admin/(portal)/page.tsx` + `src/components/admin/dashboard/*`.
13. Docs: constitution §11.7 / §11.9 / §11.13; README note on the secret.
14. Tests: unit tests for the new pure helpers (badge text, area-for-path, greeting, today strip); e2e selectors kept; run lint, typecheck, unit, design check, build.

## Assumptions

- The owner will add `SUPABASE_SERVICE_ROLE_KEY` as a Cloudflare Worker secret (Settings → Variables and Secrets) from the Supabase project's API keys page.
- Greeting uses America/New_York time (CWR is in North Carolina; inbox dates already use that zone).
- Admin e2e suites need the local Supabase stack (`npm run db:start`); they skip themselves without it (`HAS_ADMIN_DATABASE`).

## DO NOT TOUCH

- `supabase/migrations/*`, pgTAP tests, RLS policies.
- Auth, MFA, middleware, CSP (`middleware.ts`, `src/lib/admin/auth-*`, `require-admin*.ts`).
- Form intake and email/queue code (`src/lib/forms/*`, `src/lib/jobs/*`, `src/lib/email/*`, `worker.ts`, `wrangler.jsonc`).
- Footer layout, action bar, chat components, content pages.
- Constitution sections other than Style §11.7, §11.9, §11.13 (and the §11.1 `dark` row wording above).

## Edge cases (most → least critical) and solutions

| # | Edge case | Solution |
|---|---|---|
| 1 | Missing key silently loses visitor requests | Forms already show "Your message didn't send" with call/text links; owner notice on the dashboard until the key is added |
| 2 | One missing setting crashes a whole admin page | Guarded email lookups + admin `error.tsx` |
| 3 | Light-only colors on a dark header (ink bar, blue focus ring, light dropdown) | `tone-dark` on headers, gold bar, dark dropdowns; design checks on every page |
| 4 | Black logo disappears on black; white fringe | 2% trim + 2px gold ring |
| 5 | Sticky bars hide focused fields | `--header-height` matches 62/88px; sidebar scrolls on its own |
| 6 | Sign out with unsaved edits | Existing `beforeunload` warning (full-page post) |
| 7 | Bigger logo vs <64px phone header | 62px bar, 55px logo |
| 8 | Logo in admin throws staff to the public site | Admin logo → `/admin`; "View website" opens a new tab |
| 9 | Long emails / 320px | Ellipsis + `title` on desktop; wraps in the phone menu |
| 10 | Stale or huge unread count | Layout re-renders on navigation; badge caps at 99+ |
| 11 | Sidebar squeezes tablets | Sidebar only at 1024px+ |
| 12 | Staff see empty sections | Empty groups, quick actions, and cards hide; staff Today strip shows their own counts |

## Downstream Impact Analysis

### Level 1 — Direct
Files: listed in Task breakdown.
Functions/contracts affected: `Logo` props (new optional `href`); `ADMIN_AREAS` gains `group`; `fetchTeammates` / `fetchAdminUsers` fallback labels; `fetchDashboardStats` return shape (adds Today figures); `AdminNav` removed.

### Level 2 — Dependent
Files: `site-footer.tsx`, `mobile-menu.tsx` (use `Logo`); `inbox/[id]/page.tsx`, `thread-controls.tsx` (use teammates); `users/page.tsx`; `dashboard` consumers; e2e specs using "Sign out", "Inbox (N new)", nav name "Admin".
Risk: low — contracts kept (accessible names unchanged, `Logo` default unchanged).

### Level 3 — Cascading
Files: `tests/e2e/admin/*`, `tests/e2e/navigation.spec.ts`, `design-rules.spec.ts` (gold-on-light, tap targets, radius checks).
Risk: low — the ring is a border (not checked as gold ink/fill); all gold sits on `dark`.
