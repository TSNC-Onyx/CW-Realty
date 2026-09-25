# Phase 2 — Data-Driven Pages — Plan

Status: **built** (2026-09-25) on branch `phase-2-data-pages` (stacked on `phase-1-public-shell`) → pull request into `build1`.
Parent plan: `docs/cwr-website-build-plan.md` (Phase 2, tasks 10–11).

## Goal

Featured properties and team members are database records shown on index and detail pages (and on the home page), old Wix URLs redirect to them, search engines get a generated sitemap, and the current live-site content is imported for owner review.

## Scope

**In scope**
- Task 10: `/listings` index (paginated) + `/listings/[slug]`; `/team` index + `/team/[slug]`; home "Featured properties" and "Meet the team" sections; `sitemap.xml` and `robots.txt`; `noindex` on non-production hosts.
- Task 11: legacy redirects (migration); live-site import script for 4 listings, their photos, and 10 team members (Russell Casey hidden — his page no longer exists on Wix).
- Photo delivery: public Supabase Storage bucket `cwr-media`; each photo stored as AVIF + WebP at up to three widths; `<picture>` with `srcset`, reserved space, lazy loading below the fold (Style §8, §11.8).

**Out of scope**
- Admin editing and the upload pipeline for new photos (Phase 3; it must write the same file layout — see "Photo file layout").
- Property Search MLS embed (provider not chosen).
- Pushing to the hosted database or running the import against it (done at launch by the Deploy workflow and the manual "Import live-site content" workflow; see Level 3).

## Resolved decisions

| # | Question | Decision | Source |
|---|---|---|---|
| 1 | Where does seed content live? | Old-URL redirects are routing rules → a migration (same everywhere). Listings, photos, team are business content → an idempotent import script that only **adds** missing records and never overwrites later edits | Infra §4 (versioned migrations), Admin §2–3 (editable content) |
| 2 | Photo formats and sizes | AVIF + WebP at 640 / 1280 / 1920 px wide, never upscaled; original width/height stored so `srcset` lists real widths and space is reserved | Style §8, §11.8 |
| 3 | Team photo size | New nullable `photo_width` / `photo_height` on `cwr.team_members` (expand-only) | Style §11.8 (width/height set) |
| 4 | Storage security | Public-read bucket (photos are public on the site); writes only with the service-role key on the server (import script now, admin server actions in Phase 3). No policies on `storage.objects` (the migration check forbids touching protected schemas) | Infra §2 |
| 5 | Old URL → hidden team member | One hop: the middleware follows a stored redirect's target and, if it is a hidden member, answers 302 `/team` directly | Nav-reconciliation #6, #7 |
| 6 | Sold listings | Stay on `/listings` with a "Sold" tag, after active and pending ones | Nav-reconciliation #6 |
| 7 | Listing order | Status (active, pending, sold) then `sort_order`; home shows the first 3 | Admin §2 (reorder) |
| 8 | Previews indexed by Google | `X-Robots-Tag: noindex` on every host except `www.charliewardrealty.com`; `robots.txt` disallows `/admin` and lists the sitemap | SEO best practice |
| 9 | Pagination | 12 per page, `?page=` with Previous/Next links; out-of-range pages 404 | Infra §5 "paginate every list" |
| 10 | Stock images on the old site | Decorative stock pictures on the Wix pages (a Victorian house, a pink gradient) are not imported | Style §1 "no generic stock" |
| 11 | Copy | Live-site descriptions and bios, lightly edited for spelling and plain language; owner reviews in the admin portal | Build plan assumption |

## Architecture context

- Pages render per request (CSP nonce); data comes from `cwr.listings`, `cwr.listing_photos`, `cwr.team_members` through the anon client — RLS returns only live listings and visible members.
- Photo URL: `{SUPABASE_URL}/storage/v1/object/public/cwr-media/{storage_path}/{width}.{avif|webp}`.

## Photo file layout (contract for Phase 3)

`listing_photos.storage_path` / `team_members.photo_path` = a folder `listings/<listing id>/<photo id>` or `team/<member id>/<photo id>` (the same for imported and admin-uploaded photos). Inside it: `640.avif`, `640.webp`, `1280.*`, `1920.*`; a width larger than the original is saved at the original's size (never upscaled).

## Task breakdown

1. Migration `20260925001000_cwr_team_photo_size.sql` (photo width/height columns + checks) and `20260925001100_cwr_legacy_redirects.sql` (every row from navigation-reconciliation "Pages and redirects" for tenant `cwr`, `on conflict do nothing`). pgTAP `070-legacy-redirects.test.sql`.
2. `supabase/config.toml`: local bucket `cwr-media` (public, 10 MiB, AVIF/WebP only).
3. Import: `scripts/content/live-site-content.json` (listings, photos with source URL, crop, alt text; team) + `scripts/import-live-site-content.mjs` (download → sharp → upload → insert missing rows → publish listings via `cwr.transition`). `npm run content:import`. Manual workflow `.github/workflows/import-content.yml` for the hosted project.
4. Data layer `src/lib/content/`: `media.ts` (photo sources), `listings.ts` (fetch live listings page, by slug, featured), `team.ts` (fetch visible members, by slug), `format.ts` (price, beds/baths/sq ft).
5. Components `src/components/content/`: `ResponsivePhoto`, `StatusTag`, `ListingCard`, `TeamCard`, `Pagination`.
6. Pages: `app/listings/page.tsx`, `app/listings/[slug]/page.tsx`, `app/team/page.tsx`, `app/team/[slug]/page.tsx`, home sections, `app/sitemap.ts`, `app/robots.ts`; `STATIC_PAGE_PATHS` gains `/listings`, `/team`.
7. Middleware: hidden-member check on stored redirect targets; `X-Robots-Tag` on non-production hosts.
8. Tests: unit (media sources, formatting, lookup follow-through, robots header), pgTAP, Playwright (pages with and without data, pagination bounds, 404 for unknown slug).

## Assumptions

- Listing facts come from the Wix pages as they are today (some may be outdated — e.g. 912 Rocky Meadows Ln is in Concord and marked Sold). The owner corrects them in the admin portal.
- 1514 Woodridge Ave ZIP is 27405 (MLS 1204576 confirmed by public listing sites).
- Ashley Edwards's photo and title come from the Wix team grid; her profile page no longer exists, so her bio starts empty.

## DO NOT TOUCH

Parent-plan list, plus all migrations up to `20260925000900` and pgTAP files `000`–`060`.

## Edge cases (most → least critical) and solutions

| # | Edge case | Solution |
|---|---|---|
| 1 | Import runs twice or after the owner edits content → duplicates or lost edits | Insert-only by slug/storage path; existing records are skipped, never updated |
| 2 | Old link → hidden member makes two hops | Middleware checks the redirect target and answers one 302 to `/team` |
| 3 | Photo files missing (import not run on hosted) → broken images | Photos sit on the placeholder background with alt text; runbook orders the import before launch |
| 4 | Preview URLs get indexed by Google | `X-Robots-Tag: noindex` everywhere except the production host |
| 5 | Wix image download fails midway | All photo files are uploaded before the listing row exists; database steps run back to back and are undone on failure, so a re-run starts clean |
| 6 | Tiny originals look blurry | Never upscale; `srcset` only offers real widths |
| 7 | `?page=999` or `?page=abc` | Out of range or invalid → 404 page; page 1 has no `?page=` |
| 8 | Listing with no bedrooms (commercial) | Details row shows only the facts that exist |
| 9 | Team member without photo or phone | Placeholder portrait; missing contact lines hidden |

## Downstream Impact Analysis

### Level 1 — Direct
Files: two migrations, pgTAP file, `config.toml`, import script + JSON + workflow, `src/lib/content/*`, `src/components/content/*`, listing/team/home pages, `sitemap.ts`, `robots.ts`, `middleware.ts`, `navigation.ts`, `lookup.ts`.
Contracts: `cwr.team_members` gains 2 nullable columns; `cwr.redirects` gains 21 legacy rows (`/home` is handled by middleware normalization); new bucket `cwr-media`.

### Level 2 — Dependent
- Phase 1 404/redirect tests; sitemap consumers; Lighthouse (images lazy, hero/first photo eager).
- Phase 3 admin photo upload must follow the file layout contract. Risk: requires plan entry (done above).

### Level 3 — Cascading
- Hosted database: the migrations reach production only through the Deploy workflow on `main`; the import is a manual workflow needing `SUPABASE_SERVICE_ROLE_KEY` as a GitHub secret. Until then, preview links show the pages' empty states. Risk: low; flagged in the owner summary.

## Verification (2026-09-25)

| Check | Result |
|---|---|
| Unit tests | 81 passed |
| Database tests (fresh database) | 93 passed (8 files, incl. new `070-legacy-redirects`) |
| Content import (local) | 4 listings, 23 photos, 10 team members; a second run adds nothing |
| Playwright with imported content | 188 passed |
| Playwright without a database (CI mode) | 142 passed, 10 database-only tests skipped |
| lint, typecheck, db:check, db:lint, design:check, Workers build | pass |
| Independent review against this plan | 3 gaps found (import interrupted partway, missing 404 browser tests, row count in plan) — fixed and re-reviewed |
