# Selected services page — plan

> Owner said "build it" on 2026-10-02 after choosing version B (carousels on phones and tablets). Charlie Ward Sr. (broker in charge) approved the "Not included" and "How every plan works" wording on 2026-10-02 (21 NCAC 58A .0105). Source content: the owner's deck "Selected Services Content for Website Sept 2026.pptx". Decisions were made over previews built from the site's own stylesheet (2026-09-30 → 2026-10-02); this file is the consolidated final spec. No database change.

## Goal

Replace the link-only `/services/seller-consulting` page with a listed **Selected services** page at `/services/selected-services` that presents the deck's Buyer and Seller plans, add-ons, Charlie's portrait and direct line, and the contact form, using the plan-card format as the standard, with swipeable plan carousels below 1024px.

## Architecture context

- Public pages live in `app/(site)/`; the header, footer, action bar, and chat come from the layout. Menu, footer, and page lists come from `src/lib/site/navigation.ts` (`MENU_SECTIONS`, `STATIC_PAGE_PATHS`, `UNLISTED_PAGE_PATHS`); `STATIC_PAGE_PATHS` feeds the sitemap, the middleware redirect-lookup skip, and the e2e page list.
- Charlie's portrait, name, and title come from team data (`fetchTeamMemberBySlug("charlie-ward")`, `ResponsivePhoto`).
- Inline styles are blocked by the CSP, so component layout CSS lives in `app/globals.css` `@layer components` (like the home hero).
- The old page's plan card and add-on list (`app/(site)/services/seller-consulting/page.tsx`) are the base for the shared components.

## Final design

**Intro** (top-aligned two columns from 768px; phones: text, buttons, then a byline row):
- Eyebrow "Services", H1 "Selected services", lead "Pick the real estate help you need, and pay only for that.", one paragraph naming Charlie Ward Realty.
- L main "Get started" → `#request`; M secondary "See buyer plans ↓", "See seller plans ↓". Stacked full width below 1280px; one row from 1280px.
- Portrait: tablet 5/12, from 1280px 4/12 of the grid. Phones: a 112px-wide 4:5 portrait beside the caption. Caption: name (44px tall link to `/team/charlie-ward`), title, phone link "Direct: 336-708-0960" (screen-reader name "Call Charlie's direct line, 336-708-0960"). The site-wide office number stays 336-708-0560.

**Plan sections** (Buyer plans, then Seller plans; each: H2, one-line lead, plans, add-ons):
- Cards, in order: Consultation Plus (light, "Self-guided"), Working With You (dark, "Best Value"), Ready Through Close (light, "Full service").
- Card contents, in order: eyebrow, H3, price line, summary, bold includes line(s) over a divider, check items with optional details, "Not included:" small line where the deck lists exclusions, L "Get started" (screen-reader name "Get started with [plan] for [buyers/sellers]") pinned to the bottom.
- **Plan title initial (CWR):** the H3's first letter is bold (700 vs 500) via `::first-letter`. Color: `gold` on the dark card; new token `gold-deep` #806210 on light cards (4.85:1 on `surface-soft`, 5.4:1 on `page`).
- **Price line:** Team name size (19px / 24px from 768px), always smaller than the H3 (22px / 28px). Price plus 15px note ("flat fee", "per service", "commission", "based on each home sale"). Seller "3%" on a `dark` block with white text.
- Buyer prices: $500 flat fee; $500 per service (Due diligence service $500, Settlement support service $500); Commission, based on each home sale. Seller prices: $500 flat fee; $1,000 flat fee; 3% commission.
- **1024px and up:** grid, two across with Ready Through Close spanning the row (button sized to its label); three across from 1280px.
- **Below 1024px: plan carousel** (one per section):
  - Above the list, the 15px `muted` hint "Tap a plan to see it, or swipe the cards." (in the approved preview).
  - Plan list above the cards: name and price for each plan, 16px, rows of at least 48px, under a 2px `ink` rule with `line` dividers. The current plan has a 4px `ink` left bar, a bold name, and `aria-current`. The rows are links to each card, so they work without JavaScript.
  - Choosing a plan in the list slides to the card, scrolls the page so the card's top sits 16px under the header, and moves focus to the card.
  - Cards are centered with a sliver of each neighbour: phones 80vw cards with 10vw side padding, tablets 70vw / 15vw. Native scroll snap to center; the scroll bar is hidden.
  - Arrows: 48×48px square buttons with a `page` fill, 1px `field-border` border, and 24px `ink` chevron, at the left and right edges, fixed at the vertical middle of the cards (owner choice 2026-10-02). Named "Previous plan" / "Next plan". At the ends they are `aria-disabled` (shown in `line`, presses ignored) rather than `disabled`, so keyboard focus stays on the arrow. Quick double presses move one plan each (the arrows step from the requested plan, not the one mid-slide).
  - Opens on Best Value every time the carousel starts (the list and arrows always reflect the plan actually in the middle). Carousel semantics: a `group` with `aria-roledescription="carousel"` named by the section (a group, not a region, because the section is already the landmark with that name), slides "N of 3: name", and a polite live region "Showing plan N of 3: name" that speaks only after the visitor moves the carousel and once the scroll settles (not on page load). All are removed at 1024px.
  - The track has 6px of space above and 8px below the cards so a focused card's focus ring is not clipped.
  - Reduced motion: instant. No JavaScript: swipe, snap, and the list links still work; the arrows' space is reserved but invisible (no layout shift).
- Add-ons (680px list): Buyer "Additional home showing $40 per home" (for Consultation Plus); Seller MLS entry-only $300, Professional photography $150, Open house support $200, Additional offer review $100 per offer. Fix: the unit suffix uses `font-regular` (the old `font-normal` class does not exist, so "per offer" rendered bold).

**How every plan works** (H2 styled H3, 680px, check list of four points: written agreement; limited plans advise but are not agency; full service includes an agency agreement; honesty and material-fact disclosure in every plan).

**Request** (`#request`, soft tone): H2 "Get started", one line ("Tell us whether you're buying or selling and which plan interests you. A broker will get back to you within one business day."), existing `ContactForm`.

**Listing:** first item in the Services sub-menu ("Selected services") and therefore the footer; in `STATIC_PAGE_PATHS` (sitemap); indexable (no `noindex`). `/services/seller-consulting` (with or without a trailing slash) permanently redirects in one hop (301, `next.config.ts`, which runs before the middleware) to the new page. The `/services` hub page is unchanged.

## Task breakdown

1. `app/globals.css`: `--color-gold-deep`; component classes for the plan carousel (stage, track, slide, picker state, arrows) and the plan title initial.
2. `src/lib/content/selected-services.ts`: typed plan, add-on, and agreement content.
3. `src/components/content/plan-card.tsx`: plan card (server), shared by grid and carousel.
4. `src/components/content/plan-carousel.tsx` (client): plan list, stage, arrows, and behaviour; renders the grid on desktop through CSS only, so server and client markup match.
5. `src/components/content/add-on-list.tsx`.
6. `app/(site)/services/selected-services/page.tsx`: metadata, intro, two plan sections, agreement list, request section.
7. Remove `app/(site)/services/seller-consulting/page.tsx` and `tests/e2e/seller-consulting.spec.ts`; add the 301 in `next.config.ts`.
8. `src/lib/site/navigation.ts`: menu item, `STATIC_PAGE_PATHS`; `UNLISTED_PAGE_PATHS` is left empty (kept for future link-only pages).
9. Tests: `navigation.test.ts`, `lookup.test.ts`; new `tests/e2e/selected-services.spec.ts` (21 tests: menu first item, footer, sitemap, indexable, 301 with and without a trailing slash, one H1, intro portrait link and direct line, price line strictly smaller than the title, CWR initials weight and colors, carousel: opens on Best Value with no scroll bar, list brings the plan into view and focuses it, Next/Previous and both ends, focus stays on an arrow at the end, speaks only after a move, carousel and slide names; desktop grid without controls; 1024px wide card spans the row with its button sized to its label; no-JS list links; layout shift under 0.01). The page joins the axe and design-rule specs through `STATIC_PAGE_PATHS`.
10. `docs/constitution/02-style-ui-ux.md` §11.1 / §11.10 / §11.5 amendments (owner-approved variants below); `docs/reference/site/navigation-reconciliation.md` note.
11. Verify: typecheck, lint, unit, design and error checks, pgTAP, full e2e from a clean database; screenshots at 375 and 1440; independent review; then reset the local DB and re-import real content.

## Owner-approved style additions (for §11)

`gold-deep` token (CWR initial on light plan cards only); plan title initial; price line in the Team name size; "Not included" small line; multiple includes lines in one card; plan grid (2+1 from 768/1024, 3 from 1280); the 3% dark block; the plan carousel (plan list, centered cards, hidden scroll bar); icon arrow buttons (the second icon-only exception after the hero pause button); "Get started" in place of "Ask for pricing"; the intro byline and portrait layout (Team card parts rearranged).

## Assumptions

- Seller Consultation Plus items are the old "Choice services" items.
- Add-ons apply to the limited plans only.
- Copy and prices are as approved in the previews.

## DO NOT TOUCH

Contact form and its actions, header/footer/mobile menu components (only their data changes), other service pages and the `/services` hub, team data, the listings feature, database, CSP.

## Downstream impact

- Level 1: new page and components; `navigation.ts` sets; `next.config.ts` redirect; `globals.css`; constitution.
- Level 2: header and footer menus (data-driven); sitemap; middleware redirect-lookup skip (the new path is static; the old path is redirected by Next before middleware); e2e page lists (axe, design rules now include the page).
- Level 3: search engines (the page becomes indexable); anyone with the old link (301). Risk is low; no human-approval items beyond the owner's design approval.

## Known trade-off (owner choice)

Static mid-card arrows: on phones under ~850px tall, the arrows start below the screen when a plan is chosen (graded B on NN/g "controls visible"); swiping and the plan list work everywhere.
