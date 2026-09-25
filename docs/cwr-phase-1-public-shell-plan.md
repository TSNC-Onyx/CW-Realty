# Phase 1 — Public Shell — Plan

Status: **built** (2026-09-25) on branch `phase-1-public-shell` → pull request into `build1`.
Parent plan: `docs/cwr-website-build-plan.md` (Phase 1, tasks 7–9).

## Goal

Every public page of the new site exists with the Modern Editorial look, a working header, mobile menu, footer, and Call/Text/Chat bar, old URLs redirect in one hop, and unknown URLs show a helpful 404.

## Scope

**In scope**
- Task 7: design tokens (Style §11) in one file, self-hosted Fraunces + Manrope, root layout, sticky header (60px mobile / 88px desktop), desktop sub-menus, mobile menu (focus trap, Escape, focus return), skip link, footer, mobile Call/Text/Chat bar.
- Task 8: redirect middleware (normalization + `cwr.redirects`, single hop, 301); hidden team member → 302 `/team` via `cwr.is_hidden_team_member()`; 404 page.
- Task 9: Home, About, Contact (form), Privacy Policy, Resources (FAQs & Homework), Connections, CWR TouchUp (booking request form), Property Search placeholder.
- Automated design checks required by Style §11.15 (raw colors, radius, text size, tap size, gold on light).

**Out of scope** (later phases)
- Listing and team pages, home "Featured properties" / "Meet the team" sections, sitemap/robots, content seed including all legacy redirects such as `/services` → `/services/cwr-touchup` and `/faq` → `/resources` (Phase 2). Until then the menu links to `/listings` and `/team` show the 404 page.
- Saving form submissions, Turnstile, alerts (Phase 4). Forms validate on the server but do not store anything yet.
- Chat widget and desktop "Chat with us" launcher (Phase 5). Until then the bar's Chat item opens the Contact page.
- Consent banner (Phase 6). Until then "Cookie settings" links to the Privacy Policy cookie section, which states no tracking cookies are used.
- Breadcrumbs (no Phase 1 page is 3+ levels deep).
- Real photos (Phase 2 content import); Phase 1 shows the §11.8 photo placeholder frames.

## Resolved decisions (from constitutions and best practice; no owner input needed)

| # | Question | Decision | Source |
|---|---|---|---|
| 1 | Where do phone/email/address come from? | `cwr.site_settings` (Admin §4 "edit once, updates everywhere"). New expand-only migration adds office address and license columns and inserts the CWR row with the values on the live site (336-708-0560, charlie@charliewardrealty.com, 806 Green Valley Road, Suite 200, Greensboro, NC 27408). Editable later in the admin portal | Admin §4, Infra §3 |
| 2 | Page must still work if the database is down | Yes: header/footer/bar hide phone and email pieces and point to `/contact`; nothing crashes | Infra §3 "fail gracefully" |
| 3 | Forms before the inbox exists | Full form UI, on-blur checks, shared Zod schema, server validation. After passing validation the server answers "online messages open soon — call or email", and keeps what the visitor typed | Infra §1 (release unfinished work safely), Style §11.12 |
| 4 | Redirect lookups cost a database call | Only for paths that are not a known page and pass the redirect path pattern; 1.5 s timeout; on failure the request continues (404) | Infra §3, §5 |
| 5 | http→https, bare→www | Middleware only for the production host `charliewardrealty.com`; previews and localhost are untouched | Nav-reconciliation #7 |
| 6 | Trailing slash | Next.js default 308 is turned off (`skipTrailingSlashRedirect`) so the middleware issues one combined 301 | Nav-reconciliation #7 (single hop, 301) |
| 7 | 404 "search + menu" | No site search exists; 404 offers the menu sections, a Property Search link, and contact options | Nav-reconciliation #8, NN/g 404 guidance |
| 8 | Images under strict CSP | Plain `<img>` with width/height (Next `<Image>` writes inline styles that the CSP blocks) | Infra §2 |
| 9 | Menus without heavy JS | Mobile menu = native `<dialog>` (built-in focus trap, Escape, focus return); sub-menus inside it = `<details>`; desktop sub-menus = small disclosure buttons (WAI-ARIA APG) | Style §4, Infra §5 |
| 10 | Token enforcement | Tailwind 4 theme is reset and rebuilt from tokens only, so off-palette colors, rounded corners, and text under 14px cannot be written; a script blocks raw hex/px values; Playwright checks tap size and gold-on-light | Style §11.15 |
| 11 | Page copy | Taken from the current live site (About, TouchUp, Connections, FAQ topics, contact details) and tidied; Privacy Policy rewritten to match what the new site actually does | Build plan assumption "content pulled from the live site" |
| 12 | NC disclosure link | NCREC "Questions and Answers on: Working With Real Estate Agents" (`https://www.ncrec.gov/Brochures/Print/WWREAPrint.pdf`) | Nav-reconciliation Menu/footer |

## Architecture context

- Next.js 16.3 App Router on Cloudflare Workers (OpenNext). Pages render per request because the CSP nonce is per request (Phase 0).
- `middleware.ts` already sets CSP, nonce, request ID; Phase 1 adds redirect handling in front of it.
- Data: `@supabase/supabase-js` with the publishable (anon) key reads `cwr.site_settings`, `cwr.redirects`, `cwr.tenants` (all anon-readable by existing RLS) and calls `cwr.is_hidden_team_member` (anon-executable).
- New env var: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public by design; RLS protects data). `NEXT_PUBLIC_SUPABASE_URL` already exists.

## Task breakdown

1. **Dependencies**: `tailwindcss` 4.3.3, `@tailwindcss/postcss` 4.3.3, `lucide-react` 1.48.0, `zod` 4.6.5, `@supabase/supabase-js` 2.117.2; `postcss.config.mjs`.
2. **Tokens**: `app/globals.css` — the single token file (`@theme` reset + §11.1 colors, breakpoints 768/1024, radius none/full, §11.2 type styles as `@utility`, §11.5 buttons, §11.14 motion, focus ring).
3. **Fonts**: `src/lib/design/fonts.ts` — `next/font/google` (self-hosted at build) Fraunces (opsz axis) + Manrope (preloaded), `display: swap`.
4. **Logo**: `public/brand/cwr-logo-{120,176}.webp` resized copies of `docs/reference/design/modern-editorial/cwr-logo.png` (original untouched).
5. **Site data**: `src/lib/supabase/public-client.ts` (anon client, schema `cwr`, no session); `src/lib/site/site-settings.ts` (`fetchSiteSettings()` cached per request; returns `null` on failure); `src/lib/site/phone.ts` (format `+1…` → `(336) 708-0560`, `tel:`/`sms:` hrefs).
6. **Navigation data**: `src/lib/site/navigation.ts` — five menu sections, footer columns, static page paths, legal links (single source for header, mobile menu, footer, 404, middleware).
7. **Layout components** (`src/components/layout/`): `SiteHeader`, `DesktopNav` + `NavDisclosure` (client), `MobileMenu` (client, `<dialog>`), `SiteFooter`, `ActionBar`, `SkipLink`, `Logo`; `aria-current` helpers live in `navigation.ts`.
8. **UI components** (`src/components/ui/`): `Button`/`ButtonLink`, `TextLink`, `Eyebrow`, `Section`, `PhotoPlaceholder`, `Message`, `EmptyState`, `Callout`.
9. **Forms** (`src/components/forms/`, `src/lib/forms/`): shared Zod rules `field-schemas.ts` + `request-forms.ts`; server actions `submit-actions.ts`; `useRequestForm` hook + `RequestForm` used by `ContactForm` / `BookingForm` (on-blur validation, error summary with links + focus, valid state only after an error, loading button, input kept).
10. **Redirects**: `src/lib/redirects/normalize.ts` (pure: lowercase path, strip trailing slash, `/home`→`/`, canonical host/protocol), `src/lib/redirects/lookup.ts` (DB lookup + hidden member), wired into `middleware.ts`; `next.config.ts` `skipTrailingSlashRedirect: true`.
11. **Pages** (`app/`): `layout.tsx` (fonts, header, footer, bar), `page.tsx` (Home), `about/`, `contact/`, `privacy-policy/`, `resources/`, `connections/`, `services/cwr-touchup/`, `property-search/`, `not-found.tsx`.
12. **Migration**: `supabase/migrations/20260925000900_cwr_site_settings_office.sql` — add nullable `office_address_line1`, `office_address_line2`, `office_city`, `office_state`, `office_postal_code`, `license_number`; insert CWR row `on conflict do nothing`. pgTAP `060-site-settings.test.sql`.
13. **Checks**: `scripts/check-design-tokens.mjs` (`npm run design:check`, added to CI quality job); unit tests (normalize, phone, schemas, navigation); Playwright: design rules (tap ≥44, gold only on dark, radius, min text), header/menu keyboard behavior, redirects (normalization), 404, accessibility on every page, forms.
14. **Docs**: update parent plan status, README env var note.
15. **Workflows**: `preview.yml` and `deploy.yml` pass `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (a GitHub repository variable) to the build, next to the existing `NEXT_PUBLIC_SUPABASE_URL`.

## Assumptions

- Live-site contact details are current (owner can change them in the admin portal in Phase 3).
- Texts go to the same number as calls unless `text_phone` is set.
- The live FAQ PDFs are not migrated in Phase 1; the Resources page lists the same topics and invites visitors to ask for a copy.
- Testimonials on the live site are real client quotes the owner already publishes.

## DO NOT TOUCH

Everything in the parent plan's DO NOT TOUCH list, plus: existing migrations `20260925000100`–`0800` (immutable), existing pgTAP files, `.env.example` (reading is blocked by project permissions — the new variable is documented in README instead). `deploy.yml` / `preview.yml` change only by the one env line in task 15.

## Edge cases (most → least critical) and solutions

| # | Edge case | Solution |
|---|---|---|
| 1 | Database slow or down → every page could hang or crash | Short timeouts, `null` fallbacks; shell renders with Contact links instead of phone |
| 2 | Redirect loop or chain (e.g. `/Home/` → `/home` → `/`) | Normalize first, then look up the normalized path, then send one 301 to the final target; never redirect to the same URL |
| 3 | Attackers spam random URLs to force database calls | Lookups only for paths matching the redirect pattern and ≤200 chars; static pages and assets skip the lookup; Cloudflare rate limits come later (Infra §2) |
| 4 | Query strings lost on redirect (breaks UTM tracking) | Query string copied onto every redirect unchanged |
| 5 | Visitor submits a form while intake is not live | Server validates, shows a clear info message with phone/email, keeps typed text |
| 6 | JavaScript fails to load | Forms still submit to the server action (server errors shown); menus: `<details>`/links still work; mobile menu button falls back to the footer link list |
| 7 | Hidden team member URL | 302 to `/team` (temporary so it can come back) |
| 8 | Uppercase letters inside query or encoded characters | Only the path is lowercased; odd characters skip lookup and 404 |
| 9 | Sticky header hides keyboard focus | `scroll-padding-top` 60/88px and bottom 80px on mobile |
| 10 | Old phones with home bars cover the action bar | 14px bottom padding plus `env(safe-area-inset-bottom)` |
| 11 | Reduced-motion users | All transitions off under `prefers-reduced-motion` |

## Downstream Impact Analysis

### Level 1 — Direct
Files: `app/**`, `src/components/**`, `src/lib/{site,redirects,forms,supabase,design}/**`, `middleware.ts`, `next.config.ts`, `package.json`, `postcss.config.mjs`, `public/brand/*`, one new migration + pgTAP file, `tests/e2e/*`, `scripts/check-design-tokens.mjs`, `.github/workflows/ci.yml` (one step).
Contracts: `cwr.site_settings` gains nullable columns (expand only) and one row.

### Level 2 — Dependent
- Existing e2e tests (security headers, CSP nonce, axe) now run against the real shell — must still pass.
- Lighthouse budgets (200 KB script, LCP) — client JS limited to menus and forms.
- `cwr.site_settings` audit trigger records the insert (expected).
Risk: low.

### Level 3 — Cascading
- Phase 2 listing/team pages rely on the redirect middleware and navigation data; Phase 3 admin Contact editor must edit the new address columns; Phase 4 swaps the form "not yet" branch for real intake; Phase 5 swaps the Chat link for the widget; Phase 6 swaps Cookie settings for the banner.
Risk: low — each is a planned hand-off noted above. No human approval needed (no new external service, no auth change, schema change is additive under the approved architecture).

## Verification (2026-09-25)

| Check | Result |
|---|---|
| Unit tests (`npm test`) | 59 passed |
| Database tests (`supabase test db`) | 88 passed (7 files, incl. new `060-site-settings`) |
| `npm run lint`, `npm run typecheck`, `npm run db:check`, `npm run design:check`, `db:lint` | pass |
| Playwright (`npm run test:e2e`) without and with a database | 117 passed each |
| Lighthouse (home, desktop) | Performance 100, Accessibility 100, Best practices 96, SEO 100 — budgets pass |
| Workers build (`opennextjs-cloudflare build` + `wrangler dev`) | renders, 301 normalization, graceful 404 |
| Independent review against this plan | 3 gaps found (shared 1.5 s lookup deadline, Menu without JavaScript, redirect lookup tests) — all fixed and re-reviewed |
