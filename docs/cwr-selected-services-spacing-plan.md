# Selected services vertical spacing — plan (to-do item 2 of 8, 2026-10-09)

Status: APPROVED by owner 2026-10-09; BUILT on branch claude/website-updates-todo-5efd86.

## Goal

The gaps between sections on Selected services follow one clear rhythm: the two big plan sections sit the same
distance apart as the intro and Buyer plans, and the "How every plan works" note stays a little closer.

## Audit (measured 2026-10-09, real content, gap = last text/photo of one section to first of the next)

| Gap | Desktop 1440 | Tablet 768 / phone 375 | Verdict |
|---|---|---|---|
| Intro → Buyer plans | 136px | 72px | Site standard (same as every page that uses `PageIntro`) |
| Buyer plans → Seller plans | **192px** | **96px** | Too big: two same-color sections stack both paddings (96 + 96) |
| Seller plans → How every plan works | 96px | 48px | Good: the note's line sits one section padding below |
| How every plan works → Get started (grey band) | 96px to band edge | 48px to band edge | Good: Style §11.4 section padding |

Heading-to-content and in-section gaps already follow Style §11.4 (40px desktop / 24px mobile under headings).

## Scope

In scope: the Buyer plans → Seller plans gap only, plus keeping the "See seller plans" jump landing at the same
height it lands today.

Out of scope: every other page, the shared `PageIntro` and `Section` defaults, the plan cards, carousel, add-on
list, contact form, header, footer.

## Architecture context

- `app/(site)/services/selected-services/page.tsx` renders Intro → one `PlansSection` per `PLAN_SECTIONS` item
  → `AgreementNote` → the grey `#request` `Section`.
- `Section` (`src/components/ui/section.tsx`) always pads `py-12 lg:py-24` (48/96px).
- The page scrolls anchors with `scroll-padding-top: var(--header-height)` (`app/globals.css:119`), so a
  section with less top padding needs a matching `scroll-margin-top` to keep the heading clear of the header.

## Task breakdown

1. Test first, `tests/e2e/selected-services.spec.ts`: at desktop and phone, the Buyer → Seller gap equals the
   Intro → Buyer gap (±2px); after clicking "See seller plans", the Seller plans heading sits at least 48px
   below the header (96px on desktop).
2. `src/components/ui/section.tsx`: add optional `isFollowOn?: boolean` (default `false`). When true the top
   padding is `pt-6 lg:pt-10` (24/40px, the same as `PageIntro`'s bottom) with `scroll-mt-6 lg:scroll-mt-14`
   (24/56px) so an anchor jump still lands 48/96px below the header. Bottom padding is unchanged.
3. `app/(site)/services/selected-services/page.tsx`: `PlansSection` passes `isFollowOn` for every plan section
   after the first (index > 0), so a future third plan section follows the same rule.
4. Run typecheck, lint, design check, unit tests, the full browser suite on a clean test database, then reload
   real content and screenshot 320, 375, 768, 1024, 1440px.

## Result after the change

| Gap | Desktop | Tablet / phone |
|---|---|---|
| Intro → Buyer plans | 136px | 72px |
| Buyer plans → Seller plans | 136px | 72px |
| Seller plans → How every plan works | 96px | 48px |
| → Get started band | 96px | 48px |

## Assumptions

- Matching the site's existing intro gap (136/72px) keeps this page consistent with every other page; values
  stay on the 8px scale (40 + 96, 24 + 48).
- The "How every plan works" note belongs with the plans, so it stays closer (96/48px).

## DO NOT TOUCH

- `src/components/ui/page-intro.tsx`, the default `Section` padding, every other page using `Section`.
- `PlanCard`, `PlanCarousel`, `AddOnList`, `ContactForm`, `app/globals.css`, Style constitution values.

## Downstream Impact Analysis

### Level 1 — Direct
Files: `section.tsx`, `selected-services/page.tsx`, `selected-services.spec.ts`.
Contracts: `Section` gains one optional prop; default output is byte-for-byte the same.

### Level 2 — Dependent
Files: the 17 other files that render `Section`.
Risk: none — they don't pass `isFollowOn`.

### Level 3 — Cascading
Files: anchor links to `#seller-plans` (the intro button and the chat's "See seller plans" link in
`src/lib/chat/guided-tree.ts`), Lighthouse layout-shift
budget, `design-rules.spec.ts` (no sideways scroll, spacing unaffected).
Risk: low — the scroll margin keeps the anchor landing where it is today; no size change after load, so no
layout shift.

No item needs extra human approval (no architecture, security, or outside-service change).
