# Site Review Round — Implementation Plan

> Owner review of 2026-09-26. Every page below was approved by the owner in a full-page browser mockup after an automated audit (WCAG 2.2 AA contrast, text size, tap targets, no sideways scroll at 375/820/1440px; Style §11 tokens, fonts, square corners, gold only on dark). Nothing here is built yet. **Do not start until the owner explicitly says "build."** Work goes on a branch from `build1`, and a pull request targets `build1`; nothing merges without the owner's explicit approval. `main` is never touched.

## Goal

Ship the seven approved changes: Team heading rename, a new Property Management page and Services overview page, About and CWR TouchUp pages rebuilt on the old site's layout, a floating contact panel, partner photos plus a staff-managed Connections admin area, and a redesigned Home page with a Home menu link.

## Approved mockups (reference)

The approved mockups are saved in `docs/reference/design/site-review-2026-09-26/` (open `index.html`; photos load from their original hosts, so an internet connection is needed). This plan also describes every approved detail in words.

## Architecture context

- Next.js App Router site on Cloudflare Workers (OpenNext). Public pages live in `app/(site)/`, admin in `app/admin/(portal)/`.
- Design tokens: `app/globals.css` (`@theme`). Style rules: `docs/constitution/02-style-ui-ux.md` §11. Automated design checks: `tests/e2e/design-checks.ts`, `tests/e2e/design-rules.spec.ts`.
- Menu, footer, mobile menu, 404 page, sitemap and redirect middleware all read `src/lib/site/navigation.ts` (`MENU_SECTIONS`, `STATIC_PAGE_PATHS`, `getFooterColumns`).
- Content in Supabase (`cwr` schema) with Row Level Security; legacy redirects live in `cwr.redirects` (`source_path`, `target_path`, `origin`).
- The Team admin area is the pattern for Connections: `src/lib/admin/team/{actions,queries,team-schema}.ts`, `src/components/admin/team/*`, `app/admin/(portal)/team/**`, photos through `src/lib/admin/photos/*` and `src/components/admin/photos/*`, ordering through the `cwr.move_item` function, trash through the `cwr.trash` view and 30-day retention (latest definitions in `supabase/migrations/20260925001600_cwr_tracking.sql`), audit logging through the trigger list in `20260925000600_cwr_audit_log.sql`, orphaned photo cleanup in `scripts/cleanup-photo-files.mjs`.

## Task breakdown

### Step 0 — Setup
1. Branch from `origin/build1` (e.g. `site-review-round`).
2. Ask the owner for permission to download the stock photos and the TouchUp video (see "Owner items before or during build"). Store photos as AVIF + WebP under `public/images/site/` at the sizes each container needs (hero 2400w and 1200w, cards 1200w and 600w).

### Step 1 — Style guide and tokens (owner-approved amendments)
Files: `docs/constitution/02-style-ui-ux.md`, `docs/constitution/03-features-navigation.md`, `app/globals.css`, `tests/e2e/design-checks.ts`.
- §4 and Features §1: "Five or fewer top-level items" becomes "Six or fewer" (Home added, owner choice 2026-09-26).
- §1 Imagery: licensed stock photography allowed for the Home hero, Home service cards, Property Management service rows, Services cards, and the Home TouchUp band (owner choice 2026-09-26); keep the license record in `scripts/content/site-photos.json`.
- §11.1 new token `dark-translucent` = `rgba(18,18,18,0.65)`: only for the Home hero headline panel and the hero pause control, only over photos. Worst-case contrast with white text over a white photo area is 5.8:1.
- §11.2 new "Quote" style: Fraunces **300**, 32px desktop / 26px mobile (28px on Home reviews), line height 1.2–1.25, for customer quotes only.
- §11.3/§11 new "Texture" surface: `dark` with a tiled 8×8px crosshatch of `#2A2A2A` lines (1.2px), inline SVG, for Property Management dark bands only. No gradients.
- §11.5 exception: the hero pause/play control is an icon-only 44×44px button with `aria-label` ("Pause slideshow" / "Play slideshow") and a tooltip.
- §11.8 new containers: Video 16:9 (TouchUp page; max width 872px); Home hero desktop height `max(640px, 42.86vw)`, 16:9 tablet, 4:3 phone; partner portrait 4:5 (same as team).
- §11.14: hero crossfade 1200ms ease-in-out every 6 seconds; no fading with reduced motion.
- Update `design-checks.ts` so `dark-translucent` is an allowed color and the new rules above pass.

### Step 2 — Navigation and redirects
Files: `src/lib/site/navigation.ts`, `src/lib/site/navigation.test.ts`, `src/components/layout/{desktop-nav,mobile-menu,site-footer}.tsx` (only if needed), new migration `supabase/migrations/2026092600xxxx_cwr_services_page.sql`, `docs/reference/site/navigation-reconciliation.md`, `app/sitemap.ts` (no code change expected).
- `MENU_SECTIONS`: add `{ kind: "link", label: "Home", href: "/" }` first; Services gets `Property management` (`/services/property-management`) after CWR TouchUp. Keep the logo linking to `/`.
- `getFooterColumns`: exclude the Home link (it currently maps every `link` item to a "CWR team" link, which would create a wrong "Home → CWR team" column). The footer keeps five columns; its Services column gains Property management.
- `isCurrentPath("/")` already matches only `/`; confirm Home is current only on the home page.
- `STATIC_PAGE_PATHS`: add `/services` and `/services/property-management`.
- Migration: delete the legacy redirect `/services → /services/cwr-touchup` from `cwr.redirects` (origin `legacy`), so `/services` serves the new overview page. `/cwrtouchup` keeps redirecting to TouchUp.
- Update `navigation-reconciliation.md`: menu table (6 items), finding #3 resolved, Pages table.
- Check the header fits at 1024px with six items (desktop starts at 1024; mockup verified at 1096px and 1440px).

### Step 3 — Team heading (item 1)
Files: `app/(site)/team/page.tsx`, `app/(site)/page.tsx`.
- "Meet the people behind CWR" becomes "Meet the people behind Charlie Ward Realty" in both places.

### Step 4 — Property Management page (item 2)
New: `app/(site)/services/property-management/page.tsx` (+ a small `src/components/ui/texture-band.tsx` or a `tone="texture"` option on `Section`).
- Hero on the texture band: eyebrow "Property management"; H1 "Trusted property management in Greensboro, High Point, and Winston-Salem, NC"; lead "Owning rental property should feel rewarding, not overwhelming. We protect your investment, place quality tenants, and handle the day-to-day, from leasing and rent to repairs and legal compliance, so you can focus on the bigger picture."; L gold main button "Get expert property management" → `/contact`; call link.
- Light section: eyebrow "Our services"; H2 "Property management services in the Triad"; lead "Full-service management that keeps your property cared for, your tenants happy, and your returns on track." Three rows; second texture band (eyebrow "Owner support", H2 "Guidance and protection for your investment") with two rows.
- Each row: 3:2 stock photo + H3 + bold summary + check-icon bullets; desktop two columns with the photo side alternating (L, R, L / L, R); tablet two columns; phone photo on top. Exact copy per row:
  - Tenant placement and leasing — "Quality tenants, carefully chosen." — marketing on leading rental sites with professional photos; every applicant screened by the same written standards (credit, background, employment, rental history); professionally prepared leases, signing, and move-in with full transparency. Photo: family relaxing at home (Unsplash `1737649073335-6d0d683fae81`).
  - Rent collection and financial management — "Steady income, clear records." — on-time collection with secure direct deposit; consistent, professional late-payment follow-up; detailed monthly statements plus year-end reports for tax time and audit-ready records. Photo: woman paying by phone (`1758526214018-a746f9554b8b`).
  - Property maintenance and repairs — "Problems fixed fast, value protected." — 24/7 emergency repair coordination; trusted, licensed, insured vendors only; routine inspections and preventive maintenance. Photo: technician at sink pipes (`1676210134188-4c05dd172f89`).
  - Investor and landlord support — "Advice that grows your return." — market analysis for competitive rent; advice on upgrades that add tenant appeal and long-term value; clear communication and regular updates. Photo: swatches over plans (`1667400104764-a5fd01a919b0`).
  - Legal compliance and risk management — "Managed by the book." — compliance with federal, state, and local housing laws including fair housing; evictions, when unavoidable, coordinated with discretion and proper legal procedure. Photo: client signing beside advisor (`1562564055-71e051d33c19`).
- Closing `surface-soft` band: H2 "Ready to hand off the day-to-day?", "Tell us about your rental property. A property manager will reach out to talk through your goals.", L ink main button + "Or call …" text link.
- Metadata title "Property management", description from the H1.

### Step 5 — Services overview page (item 7b)
New: `app/(site)/services/page.tsx`.
- Eyebrow "Services", H1 "Our services", lead "Two ways we help you get more from your property, whether you're getting ready to sell or keeping it as a rental."
- Two `surface-soft` cards with 2px ink top rule, 3:2 photo, eyebrow, H3 (32px), body, "Explore …" text link; the whole card is one link. CWR TouchUp card uses the TouchUp video's opening frame (house with CWR sign); Property management card uses the brick townhomes photo (`1738796027443-b8d03fd07298`).
- Closing line: "Not sure which fits? Talk with our team or call 336-708-0560." (phone from site settings).

### Step 6 — About page (item 3)
File: `app/(site)/about/page.tsx`.
- Top: 5/7 grid; left Charlie Ward Sr.'s team portrait (4:5, from `fetchTeamMembers()` slug `charlie-ward`, placeholder if missing); right eyebrow "About us", H1 "Welcome to Charlie Ward Realty", Fraunces 32px "“Let us show you home.”", byline "Charlie Ward Sr., broker in charge and team leader" (from the team record's name and title), lead intro. Phone: portrait first.
- `surface-soft` "Who we are" (H2 "Local knowledge, real connections") with the two approved paragraphs; "Our track record" with the two 98% figures (80px Fraunces); dark "How we work" band: H2 "Personal connections matter most", lead, seven-step strip (Financing, Showings, Making an offer, Inspection, Appraisal, Securing the title, Keys at closing) — 7 columns desktop, 4 tablet, 2 phone — and an L gold "Talk with our team" button.

### Step 7 — Contact page (item 4)
File: `app/(site)/contact/page.tsx` (and `PageIntro` usage).
- One 12-column grid with areas: intro (cols 1–7), aside "Reach us directly" (cols 9–12, spanning both rows), form (cols 1–7).
- Desktop (≥1024px and viewport ≥640px tall): aside is `position: sticky; top: 112px` (88px header + 24px); it starts level with the "Contact" eyebrow and stops at the section's end, never over the header or footer.
- Below 1024px: order is intro → aside → form, no sticky; remove the extra gap above "Send us a message".
- Form unchanged.

### Step 8 — Connections page and admin (item 5)
**Human approval required before this step (new table and access rules).**
- Migration `2026092600xxxx_cwr_connections.sql`: table `cwr.connections` (id, tenant_id, full_name, category, title_line, company nullable, phone E.164, email nullable, website nullable, photo_path/alt/width/height with the same pairing and size checks as team, is_visible, sort_order, created_at, updated_at, deleted_at); indexes like `team_members`; `updated_at` and `deleted_at` guard triggers; RLS matching `team_members` (public reads visible, not deleted; editors write within tenant); grants; add `connections` to the audit-log trigger list, the `cwr.trash` view, the 30-day retention purge, and the `move_item` table allowlist. Category is a check-constrained list: Lending, Insurance, Home warranty, Contractors and repairs, Design and staging, Other.
- pgTAP test `supabase/tests/database/130-connections.test.sql` (RLS read/write by role, trash, move_item); update `010-schema-guards` if it lists tables.
- Seed: extend `scripts/content/live-site-content.json` and `scripts/import-live-site-content.mjs` with the three partners and their current-site photos (Vickie V. Foust — Lending, "Loan officer, NMLS 86956", 336-202-3409; Kim Bates — Insurance, "State Farm insurance agent", 336-768-6351; Matthew Young — Insurance, "GEICO insurance agent", 336-852-7283).
- Photo cleanup: add the `connections/` folder to `scripts/cleanup-photo-files.mjs`.
- Admin: `src/lib/admin/connections/{actions,queries,connection-schema}.ts`, `src/components/admin/connections/{connection-list,connection-form,connection-photo}.tsx`, `app/admin/(portal)/connections/{page,new/page,[id]/page}.tsx`, mirroring Team (up/down move, Shown/Hidden with icon + word, Edit, Add connection, Move to trash, photo replace with alt text, idempotent create). Form fields: full name, category (select), title or license, phone, email (optional), website (optional), photo + photo description, "Show on the website". Add the `connections` area to `src/lib/admin/navigation.ts` (group "website", `EDITOR_ROLES`, description "Add, edit, reorder, and show or hide referral partners.") and its icon in `src/components/admin/frame/admin-area-icons.tsx`.
- Public: `src/lib/content/connections.ts` (visible, ordered, grouped by category); `app/(site)/connections/page.tsx` renders a heading per category that has partners, cards with 4:5 photo (placeholder icon if none), category label, name (H3), title line, "Call …" link; "Need someone we haven't listed?" `surface-soft` box with "Ask us for a referral" → `/contact`; keep the existing free-choice disclaimer. Remove the hard-coded `PARTNERS` list.

### Step 9 — CWR TouchUp page (item 6)
File: `app/(site)/services/cwr-touchup/page.tsx`.
- Order: intro (eyebrow "Home selling tip #1", H1 "CWR TouchUp", approved lead) → video → "What homeowners say" dark band → "How it works" with the request form beside the steps (form below on phones).
- Video: self-hosted MP4 (moved off Wix; see owner items), `<video controls preload="none" playsinline>` with the poster frame, 16:9, max width 872px, caption track (`.vtt`) required before launch.
- Quotes: H2 "We call it a game changer. Here's what our customers say."; the three quotes in the new Quote style (Fraunces 300).
- Steps: numbered 64px round dark badges with gold numbers; copy as approved.

### Step 10 — Home page (item 7)
File: `app/(site)/page.tsx` (+ `src/components/home/hero-slideshow.tsx` client component).
- Hero: three photos crossfading (6s each, 1.2s fade): white contemporary farmhouse (`1662505899914-1000c566477b`), luxury living room with arched windows (`1600210491892-03d54c0aaf87`), brick home with timber-covered patio (`1783927409846-f5b0ab3bbf2e`); alt text starts "Example of …". First photo preloaded with `fetchpriority="high"`; the others load after it. Pause/play icon button (bottom-right desktop, top-right tablet/phone). Reduced motion shows the first photo only.
- Headline panel: desktop sits on the photo (48px from the bottom) with `dark-translucent`; tablet/phone solid `dark` below the photo. Eyebrow "Charlie Ward Realty"; Display "Let us show you home."; lead; L gold "Talk to an agent".
- "What we do": H2 "You're in the right place" with L ink "View featured listings" beside it; three cards (3:2 photo, H3, body, text link): Find your new home → `/property-search` (porch `1604882234072-d5741489e0c0`); Sell your home → "Get a free home evaluation" → `/contact` (living room `1656122381069-9ec666d95cf1`); Secure investment property → "Explore property management" (townhomes `1738796027443-b8d03fd07298`).
- "What our clients say" (`surface-soft`, 4/8 grid): exact quotes from the current site in Quote style 28px — Julie (High Point, NC, starting "…I would have priced"), Byron Griffin Sr. (Purchased a home in 2019), Michelle Lewis (Greensboro, NC). Never edited beyond the leading ellipsis.
- CWR TouchUp band: unchanged except its photo becomes the professional painter (`1688372198189-de6a51777a81`, alt "Professional painter in work coveralls painting an interior wall").
- Team preview: unchanged (heading renamed in Step 3).
- Removed from Home: the featured listings grid, the hero-from-listing-photo logic, and the two resource cards.

### Step 11 — Verification
- `npm run lint`, `npm run typecheck` (or `tsc --noEmit`), `npm test`, `supabase test db`, Playwright e2e including `design-rules`, `accessibility` (axe), `navigation`, `content`, and a new `tests/e2e/admin/connections.spec.ts`.
- Add pages to `tests/e2e/pages.ts`: `/services`, `/services/property-management`.
- Manual checks at 320, 375, 768, 1024, 1440px; keyboard pass (menu, hero pause button, sticky aside focus never hidden); VoiceOver pass on Home and Connections admin.
- Compare each page against the approved mockups.
- Subagent review against this plan, then a pull request to `build1`. **Do not merge without the owner's explicit approval.**

## Assumptions

- Stock photos are Unsplash (free license, no attribution required); they will be downloaded and self-hosted with owner permission. IDs above are Unsplash photo IDs.
- Partner photos on the current Wix site may be reused (they were already public there with the partners' involvement); owner confirms.
- The TouchUp video belongs to CWR and can be moved off Wix.
- Charlie Ward Sr.'s team photo is the About portrait; if it changes in Team admin, the About page follows.
- Review quotes are the owner's existing public testimonials; only exact wording is used (FTC 2024 rule on consumer reviews).
- Fraunces is loaded as a variable font through `next/font`, so weight 300 needs no extra download.

## DO NOT TOUCH

- `main` branch and `.github/workflows/deploy.yml`.
- Forms and their server actions (`src/components/forms/*`, `src/lib/forms/*`), Turnstile, chat assistant code (`src/lib/chat/*`), tracking/consent code.
- Listings, listing detail, property search, resources, privacy pages.
- Existing migrations (add new ones only), existing RLS on other tables, auth and admin session code.
- Team admin behavior (used as a pattern only).

## Downstream impact analysis

### Level 1 — Direct
Files: `src/lib/site/navigation.ts`; `app/(site)/{page,about/page,contact/page,team/page,connections/page,services/cwr-touchup/page}.tsx`; new `app/(site)/services/{page,property-management/page}.tsx`; new `cwr.connections` table and admin area; `app/globals.css`; constitution §2/§3 docs; `design-checks.ts`.
Contracts: `MENU_SECTIONS` shape (adds a link item first), `STATIC_PAGE_PATHS` (two new paths), `cwr.redirects` (one row removed).

### Level 2 — Dependent
Files: `desktop-nav.tsx`, `mobile-menu.tsx`, `site-footer.tsx` (`getFooterColumns`), `app/sitemap.ts`, `middleware.ts` (static path check skips the DB for `/services`), 404 page menu, `src/lib/admin/navigation.ts` consumers (sidebar, mobile menu, dashboard area cards), `cwr.trash` view consumers (`src/lib/admin/trash/*`), `move_item` callers, `scripts/cleanup-photo-files.mjs`, `scripts/import-live-site-content.mjs`.
Risk: **requires plan entry** (all covered above). The footer "Home → CWR team" bug is a known trap. **Requires human approval**: the new table and its access rules (Step 8).

### Level 3 — Cascading
- Unit and e2e tests that assert the menu, pages list, admin areas, or trash contents (`navigation.test.ts`, `src/lib/admin/navigation.test.ts`, `tests/e2e/navigation.spec.ts`, `pages.ts`, `settings-trash-users.spec.ts`, pgTAP schema guards).
- Chat assistant answers only from the approved policy: it cannot answer property-management questions until the owner adds that section in Admin → Chatbot policy (content, not code).
- Home page Largest Contentful Paint: the hero is now a stock photo instead of a listing photo; keep it preloaded and self-hosted as AVIF to stay under 2.5 seconds.
- Search engines: `/services` changes from a redirect to a page; the sitemap picks it up automatically.
Risk: low, provided tests are updated in the same PR.

## Build notes (2026-09-26)

- Built on branch `site-review-round` from `build1`. Photos are self-hosted in `public/images/site` by `npm run photos:site` (list and licenses: `scripts/content/site-photos.json`); the TouchUp video is `public/video/cwr-touchup.mp4` (v2 from the owner 2026-09-27: 18 MB, 1080p H.264, under the 25 MiB Cloudflare file limit). Its cover (`touchup-poster`) is the owner-chosen brand card (2026-09-27, Option C of 3: CWR logo in the gold ring on the dark texture, "CWR TouchUp" in Fraunces, "Sell for more. Seamlessly." in Manrope; text kept out of the bottom 16% where the play bar sits; smallest phone text 15.7px). Its 1920×1080 source is `scripts/content/site-photo-sources/touchup-cover.png`; `npm run photos:site -- touchup-poster` rebuilds just that photo.
- Connections: the optional "company" column was left out; the approved admin mockup had no company field, and the title line covers it (for example "State Farm insurance agent"). The public page shows one grid under a heading built from the categories present ("Lending and insurance"), matching the approved mockup, rather than one heading per category.
- Video captions: not added yet. No transcription tool was available, so the owner needs to supply a transcript (or confirm the video has no speech). The page has no caption track until then; this is a launch blocker under WCAG 1.2.2.
- Site photos use the site's shared 640/1280/1920px widths rather than the 2400w/1200w/600w sizes planned; on very large high-density screens the hero is capped at 1920px wide.
- Header at 1024–1279px: with six menu items the phone number wrapped onto three lines, so those widths show the phone icon plus "Call" (same link, one line); 1280px and wider show the number. Recorded in Style §11.9.
- Connections trash rows use the plain name, like team members, since the trash page already shows the type.
- The About page byline and portrait come from Charlie Ward Sr.'s team profile, so they follow any edits in Admin → Team.

## Owner items before or during build

1. **Say "build"** to start.
2. **Approve the new Connections table and its access rules** (Step 8), which is an architectural change.
3. **Permission to download**: 12 Unsplash photos listed above (roughly 0.3–1 MB each at full size) and the TouchUp video from Wix (720p MP4). Photo licenses are recorded in `scripts/content/site-photos.json`.
4. **Video captions**: approve the caption text I write from the video's audio.
5. **Confirm** partner photos may be reused.
6. **Chatbot policy**: add a Property Management section in Admin → Chatbot policy (I can draft the text).

---

# Round 2 — Homework page and Admin → Homework (approved 2026-09-27)

> Owner approved the public Homework page mockup and the three Admin → Homework screens (`docs/reference/design/site-review-2026-09-26/homework*.html`). Decisions: videos at 480p (approved); link the NC Real Estate Commission's official brochure instead of the old copy (approved); keep the Spanish PowerPoint as-is (no PDF); video captions moved to open items. **Do not start until the owner says "build."** Same branch (`site-review-round`) and PR #11; nothing merges without explicit approval.

## Goal

Staff can upload, describe, group, order, show/hide, and trash the Homework page's videos, downloads, and links from the admin portal, and the public `/resources` page shows them like the old site: embedded videos plus grouped downloads.

## Design summary (approved)

- **Public `/resources`**: intro ("FAQs & Homework" / "Homework"); **Videos** (16:9 players with cover, title, "Video · m:ss", description; two per row on desktop); **Guides to read and keep** grouped For buyers / For sellers / En español / Required reading in North Carolina, each row: file icon, title, description, "PDF · 1.3 MB", M secondary "Download PDF" (Spanish items read "Descargar …" and carry `lang="es"`); closing box "Have a question these don't answer?" → Ask us a question.
- **Admin → Homework** (Website group, editors): list with Videos and grouped Downloads and links; each row shows cover or file icon, title, type/length/size, Shown/Hidden (icon + word), a warning tag "No captions yet" on videos without captions, and Edit / Up / Down / Hide / Trash. Buttons "Add video" (main) and "Add download or link".
- **Video editor**: Video file (MP4, up to 50 MB; length and size filled in), optional Cover picture (16:9, via the existing photo upload), Captions (.vtt upload; warning message until added), Details (title, description, "This video is in Spanish"), On the website (show), sticky Save bar.
- **Download editor**: What visitors get (file / link), File (PDF, PowerPoint, Word, Excel up to 20 MB; type and size filled in) or Web address, Details (title, description, group, "This guide is in Spanish"), On the website, Save bar.

## Task breakdown

1. **Database** — migration `20260927000100_cwr_homework.sql`: `cwr.homework_items` (id, tenant_id, kind `video|file|link`, group_key `buyers|sellers|spanish|required` (null for videos), title, description, is_spanish, file_path, file_name, file_mime, file_size_bytes, duration_seconds, poster photo columns (same pairing checks as team), captions_path, link_url (https only), is_visible, sort_order, deleted_at, timestamps; checks that each kind has its required fields). RLS, grants, audit trigger, `updated_at`/`deleted_at` guards, trash view + 30-day purge exactly like `cwr.connections`. Reordering stays inside one list (videos, or one download group), so add `cwr.move_homework_item(id, direction)` built on `move_item`'s logic, scoped by tenant + list. pgTAP `140-homework.test.sql`.
2. **File storage** — new public bucket `cwr-files` (50 MiB limit; MP4, PDF, PPTX, DOCX, XLSX, VTT): `supabase/config.toml` for local; created by the import script when missing (as `cwr-media` is). Files at `homework/{item id}/{upload id}/{file name}`. Downloads use Supabase's `?download=<file name>` so browsers save them with a clear name.
3. **Security setting** (security-sensitive; covered by this approval) — add `media-src 'self' <Supabase origin>` to `src/lib/security/content-security-policy.ts` (+ its test) so videos and captions play from storage.
4. **Uploads** — server actions that check the editor and item, check type and size, and hand out one-time signed upload links (like photos); the browser uploads directly (large files never pass through the website), reads a video's length first, then a save action confirms the file exists and records name, type, size, and length. Captions must start with `WEBVTT`. Replacing a file makes the old one unused; `scripts/cleanup-photo-files.mjs` (extended to `cwr-files/homework`) removes files nothing uses at its next nightly run (no Undo for a replaced file).
5. **Admin** — `src/lib/admin/homework/*`, `src/components/admin/homework/*`, `app/admin/(portal)/homework/{page,new-video,new-download,[id]}`; area in `src/lib/admin/navigation.ts` + icon; trash label "Homework item".
6. **Public page** — rewrite `app/(site)/resources/page.tsx` from `src/lib/content/homework.ts` (visible items, grouped, formatted size/length); tracks captions when present; falls back to a short message and contact link if the database is unavailable.
7. **Import** — add the 2 videos (480p), their covers, the 5 files (4 PDFs + the Spanish PowerPoint), and the NCREC link to `scripts/content/live-site-content.json`; `import-live-site-content.mjs` loads them (skip if a same-title item exists).
8. **Verification** — lint, types, unit, design and migration checks, pgTAP, Playwright (public page, admin: add a PDF and a link, reorder, hide/undo; captions warning shown). Afterwards reset the local database and reload real content before any preview (standing rule). Style guide: add the download row and the admin captions tag.

## Downstream impact (3 levels)

- **Level 1**: new table, bucket, CSP `media-src`, `/resources` page, admin area.
- **Level 2**: trash view/purge (all earlier item types kept), admin sidebar and dashboard cards, cleanup script, import script, security-header tests (`content-security-policy.test.ts`, `security-headers.spec.ts`).
- **Level 3**: production needs the `cwr-files` bucket (created by the import script run or once in the Supabase dashboard) and the migration applied at deploy; the chat assistant's policy does not mention these guides (content, owner's choice). Risk: low with tests updated in the same PR.

## DO NOT TOUCH

Same list as round 1, plus: existing `cwr-media` bucket and photo pipeline behavior, Connections, and all round-1 approved pages.

## Round 2 build notes (2026-09-27)

- Built as planned: migration `20260927000100_cwr_homework.sql` (table, RLS, trash, purge, `cwr.move_homework_item`), bucket `cwr-files` (config + created by the import script), CSP `media-src 'self' <Supabase>`, Admin → Homework (list, add video, add download or link, edit with file/cover/captions panels), public `/resources` from the database, import of the 2 videos (480p, 11.5 MB and 22.3 MB), 5 files, and the NCREC link, and the cleanup script extended to `cwr-files`.
- New items start hidden; the first successful file upload shows them. A download switched to a link drops its file (cleanup removes it); a link switched to a file stays hidden until a file is uploaded.
- After upload the server checks the stored file's type and extension against the slot (video, guide, captions) and removes anything that doesn't match; a replaced video's length is always rewritten.
- The edit page shows file type, size, and length but not an upload date (the database does not record one).
- The admin accessibility test now also covers Connections and the Homework screens (Connections had been missed in round 1).

## Open items after round 2

Captions for the TouchUp video and both Homework videos (staff can upload `.vtt` files in Admin once built); chatbot policy section for Property Management; production content import.
