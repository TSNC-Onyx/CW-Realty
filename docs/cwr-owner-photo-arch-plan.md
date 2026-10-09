# Owner photo arch crop — plan (to-do item 1 of 8, 2026-10-09)

Status: APPROVED by owner 2026-10-09; BUILT on branch claude/website-updates-todo-5efd86.

## Goal

Charlie's portrait on the About page and the Selected services page has a rounded arch top (a half circle across
the full width) and square bottom corners; every other photo on the site stays square.

## Scope

In scope:
- About page intro portrait (`app/(site)/about/page.tsx`, `WelcomeIntro`).
- Selected services intro portrait (`app/(site)/services/selected-services/page.tsx`, `BrokerByline`), at every
  screen size, including the 112px phone byline.
- The grey "no photo yet" placeholder in those two spots gets the same arch, so the shape never changes.
- A written exception in the style rules (Style §11.3) and in the automated corner checks, the same way the
  chat topic buttons got theirs on 2026-10-06.

Out of scope:
- The team page (`/team/charlie-ward`), team cards, listings, galleries, the admin console, link-preview images.
- Changing the photo itself, its size, its 4:5 shape, or the page layouts.

## Architecture context

- Both pages render the portrait with `ResponsivePhoto` (`src/components/content/responsive-photo.tsx`), which
  draws a `<picture>` frame with `overflow-hidden`, or `PhotoPlaceholder` (`src/components/ui/photo-placeholder.tsx`)
  when there is no photo.
- The token file `app/globals.css` clears Tailwind's radius tokens, so the arch must be a named class there
  (like `.btn-chat-topic`). `scripts/check-design-tokens.mjs` only bans `rounded-*` utilities in app code, so a
  named class passes it unchanged.
- `tests/e2e/design-checks.ts` `getCornerViolations` fails any non-circle element with a radius. It runs on all
  public pages, so it needs a one-class exemption.

## Task breakdown

1. `app/globals.css`: add `.photo-arch { border-radius: 9999px 9999px 0 0; }` beside `.btn-chat-topic`, with a
   comment naming the owner choice. Browsers shrink an oversized radius to fit (CSS Backgrounds 3 §5.5), so the
   top is always an exact half circle of the frame's width, at any size.
2. `src/components/ui/photo-placeholder.tsx`: add optional `shape?: "rect" | "arch"` (default `"rect"`); `"arch"`
   adds `photo-arch`.
3. `src/components/content/responsive-photo.tsx`: add the same optional `shape` prop to `ResponsivePhoto`; pass it
   to the `<picture>` frame class and to `PhotoPlaceholder`. `SitePhotoImage` is untouched.
4. `app/(site)/about/page.tsx` and `app/(site)/services/selected-services/page.tsx`: pass `shape="arch"` on the
   one portrait each.
5. `tests/e2e/design-checks.ts`: `getCornerViolations` skips elements with class `photo-arch`.
6. Tests (written first): `tests/e2e/owner-photo-arch.spec.ts` checks that the About and Selected services
   portraits have class `photo-arch`, a rounded top-left and a square bottom-left corner at all four test
   widths, and that the team page portrait stays square. (Built: the unit runner only covers `.ts` files in
   Node, so the component checks live in the e2e spec instead of a React unit test.)
7. `docs/constitution/02-style-ui-ux.md` §11.3: add the exception line (owner choice 2026-10-09, this plan).
8. Visual check with screenshots at 320, 390, 768, 1024, 1440px on both pages, with the real photo and with no
   photo; reload real content into the local database before previewing.

## Assumptions

- "Arch" means a full half-circle top with straight sides and a square bottom (the classic arched-window shape).
- The photo keeps its 4:5 frame; only the two top corners are cut.
- Charlie's face sits low enough in the frame that the arch only trims background; confirmed by screenshot in
  step 8 (see edge case 1 if not).

## DO NOT TOUCH

- `SitePhotoImage`, `listing-card.tsx`, `team-card.tsx`, `photo-gallery.tsx`, `photo-viewer.tsx`,
  `app/(site)/team/[slug]/page.tsx`, all admin photo components.
- `scripts/check-design-tokens.mjs` (no change needed).
- Photo files, the database, the image pipeline, page copy and layout classes.

## Downstream Impact Analysis

### Level 1 — Direct
Files: `app/globals.css`, `responsive-photo.tsx`, `photo-placeholder.tsx`, About page, Selected services page,
`tests/e2e/design-checks.ts`, Style §11.3.
Contracts: `ResponsivePhoto` and `PhotoPlaceholder` gain one optional prop with a square default.

### Level 2 — Dependent
Files: every other caller of `ResponsivePhoto` / `PhotoPlaceholder` (team, listings, connections, gallery,
viewer, admin photo panels).
Risk: none — they don't pass `shape`, so the default keeps them square. Typecheck confirms.

### Level 3 — Cascading
Files: `design-rules.spec.ts` corner test and the axe accessibility scan on all public pages.
Risk: low — the corner test gets a single-class exemption; alt text and layout size are unchanged, so axe and
layout-shift results stay the same.

No item needs extra human approval (no architecture, security, or outside-service change).
