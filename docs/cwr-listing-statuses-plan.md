# Listing statuses — plan

> Owner decisions 2026-10-02: four statuses in this order — Coming Soon, For Sale, Under Contract, Sold. Coming Soon dot is white. Skips allowed. Listings page order: Coming Soon, For Sale, Under Contract, Sold. Coming Soon listing page invites "tell me when it's ready" instead of a showing. New listings start as Coming Soon.
> Owner said "build it" on 2026-10-02. Applying the migrations to the production database needs a separate owner approval.
> Owner said "update it" on 2026-10-07: brought up to date with build1 (32 commits). Migrations re-dated to 20261007000100 / 20261007000200 so they run after those already live; pgTAP file renumbered to 200; no newer migration touches the listing enum, trigger, or `install_default_workflows`, and production's move table matched the 2026-09-28 definition before this change.

## Goal

Listings move through Coming Soon → For Sale → Under Contract → Sold (with skips and a few corrections), and every place a status appears uses those names, colors, and order.

## Architecture context

- Status is the Postgres enum `cwr.listing_status` ('active', 'pending', 'sold'), column `cwr.listings.status` default 'active' (migration 20260925000200).
- Allowed moves live in `cwr.workflow_transitions` (text states, per tenant), installed by `cwr.install_default_workflows` (latest definition in 20260928000200) and enforced by `cwr.transition()`. The app only decides which buttons to show (`src/lib/admin/listings/workflow.ts`).
- Public: `StatusTag` (`src/components/content/status-tag.tsx`), `ListingContactPanel` in `listing-detail.tsx`, list order in `src/lib/content/listings.ts` (`.order("status")` follows enum order), Zod enum there too.
- Admin: `listing-publishing.tsx` ("Mark as …" buttons with Undo), `listing-list.tsx` summary, server action enum in `src/lib/admin/listings/actions.ts`.
- Content import: `scripts/import-live-site-content.mjs` + `scripts/content/live-site-content.json`; test fixture `tests/fixtures/test-content.json`.
- Style: constitution §11.1 (`gold` = Pending dot, `status-active`/`status-sold`), §11.8 status tag.

## Status design

| Key | Label | Tag dot | Page order |
|---|---|---|---|
| `coming_soon` | Coming Soon | white (`on-dark`, 18.7:1 on `dark`) | 1 |
| `for_sale` (was `active`) | For Sale | green `status-for-sale` (token renamed from `status-active`) | 2 |
| `under_contract` (was `pending`) | Under Contract | gold | 3 |
| `sold` | Sold | red `status-sold` | 4 |

Internal keys are renamed to match the labels so the database, code, and admin words agree (ALTER TYPE … RENAME VALUE keeps every existing row; no data copy).

Allowed moves (owner and manager roles, as today):

| From \ To | Coming Soon | For Sale | Under Contract | Sold |
|---|---|---|---|---|
| Coming Soon | — | yes | yes (skip) | yes (skip) |
| For Sale | yes (back) | — | yes | yes (skip) |
| Under Contract | — | yes (deal fell through) | — | yes |
| Sold | — | yes (fix a mistake) | — | — |

Undo after a move is offered only when the reverse move is allowed (existing rule).

Listing page panel:
- Coming Soon: heading "Coming soon", body "This home isn't ready for showings yet. Ask us to let you know when it is.", buttons Call / Text as today.
- For Sale and Under Contract: unchanged ("Interested in this property?" / "Schedule a showing or ask a question.").
- Sold: unchanged.

## Task breakdown

1. Migration A `supabase/migrations/20261007000100_cwr_listing_status_names.sql`: rename enum values ('active'→'for_sale', 'pending'→'under_contract'); add 'coming_soon' BEFORE 'for_sale'. (Separate file because a new enum value cannot be used in the same transaction.)
2. Migration B `20261007000200_cwr_listing_status_moves.sql`: column default → 'coming_soon'; recreate the `listings_guard_status` trigger so new rows must start as 'coming_soon' (it named 'active'); `create or replace cwr.install_default_workflows` with the new move table; delete each tenant's `listing_status` workflow (its moves cascade) and reinstall it; audit/RLS untouched.
3. New `src/lib/content/listing-statuses.ts` (no server imports, so browser components can use it): `LISTING_STATUSES` in enum order, `ListingStatus`, `LISTING_STATUS_LABELS` — the one list the site, admin, and Zod schemas share. `src/lib/content/listings.ts` uses it.
4. `src/lib/admin/listings/workflow.ts`: moves (mirror of the database table); labels now come from step 3 (admin list and status buttons updated).
5. `src/lib/admin/listings/actions.ts`: `toState` enum.
6. `src/components/content/status-tag.tsx`: labels from step 3 and dot classes (`bg-on-dark` for Coming Soon); `app/globals.css` token `--color-status-active` renamed `--color-status-for-sale`.
7. `src/components/content/listing-detail.tsx`: Coming Soon panel text.
8. `app/globals.css` comment; constitution §11.1 and §11.8 wording (owner-approved amendment).
9. Import data and fixtures: `scripts/content/live-site-content.json` ("pending" → "under_contract", "active" → "for_sale"), `scripts/import-live-site-content.mjs` (starting status constant `coming_soon`), `tests/fixtures/test-content.json` (3826 Burlington Rd becomes Coming Soon so the tests cover that status).
10. Tests: unit test for workflow moves (each allowed and blocked move, undo rule); pgTAP `030-workflow-engine.test.sql` (new names, skips allowed, blocked moves rejected, default is coming_soon, existing rows renamed); e2e `content.spec.ts` (tag words and order on /listings, Coming Soon panel) and `admin/listings.spec.ts` (buttons per status).
11. Verify: typecheck, lint, unit, pgTAP, e2e, design check, build; screenshots of a card in each status at 375 and 1440; reset local DB and re-import real content.
12. Production (separate owner approval): apply migrations A and B to the live database and record them, then merge right away. The site only accepts the status names of its own version, so between the database change and the new code going live, /listings and the Home featured listings fail. Do the two back to back to keep that window to the few minutes a deploy takes.

## Assumptions

- Only owners and managers change status (unchanged).
- Coming Soon listings appear on the website like others when published (publishing stays a separate switch). If Charlie's MLS check says otherwise, keep them as drafts until For Sale.
- Property search (external IDX) is unaffected.

## DO NOT TOUCH

Publishing workflow (`listing_publish`), photos, inbox and chat workflows, RLS policies, audit log, other enums, header/footer/nav.

## Downstream impact

- Level 1: enum, default, transition rows, install function; listings Zod schema; admin workflow/actions; status tag; listing panel; import data; tests; style doc.
- Level 2: `cwr.transition()` (reads text states — works unchanged); `/listings` and Home featured listings (order follows enum); sitemap (unchanged); admin list summary; audit log rows keep old words for past changes (history stays accurate).
- Level 3: live database migration (needs owner approval); anything outside the app reading `status` — none found.

## Audit

| Criterion | Source | Result |
|---|---|---|
| Color is not the only signal | WCAG 2.2 SC 1.4.1 | Pass: every tag shows the word |
| Dot visible on the black tag | WCAG 2.2 SC 1.4.11 (3:1 for graphics) | Pass: white 18.7:1, green 6.8:1, gold 10.4:1, red 5.1:1 |
| Clear, familiar wording | NN/g plain language / Digital.gov | Pass: the words agents and buyers already use |
| Data safety | PostgreSQL docs, ALTER TYPE RENAME VALUE / ADD VALUE | Pass: rename keeps rows; add-value split into its own migration |
| Database stays the authority | Infra constitution §4 | Pass: moves enforced by `cwr.transition()`; UI only mirrors |
| Regulatory | NAR Clear Cooperation / local MLS rules | Pass: Charlie (broker in charge) approved Coming Soon advertising with the MLS on 2026-10-02 |
