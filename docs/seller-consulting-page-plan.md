# Seller consulting page — plan

> Owner decisions 2026-09-26: design Option A (side-by-side plan cards), its own page, plan prices shown as "Ask for pricing", the Well advised label reads "Best Value", and the page is link-only (not in the menu, sitemap, or search results) until a companion page the owner cannot name yet launches. Owner asked to build it and merge to `build1`.

## Goal

A new unlisted public page at `/services/seller-consulting` that presents the two seller consulting plans (Choice services, Well advised), the four priced add-ons, and a contact form for pricing, in the Modern Editorial design system.

## Architecture context

- Public pages live under `app/(site)/`; the shared header, footer, action bar, and chat come from `app/(site)/layout.tsx`. The closest existing page is `app/(site)/services/cwr-touchup/page.tsx` (PageIntro + Sections + an embedded request form).
- `src/lib/site/navigation.ts` holds `MENU_SECTIONS` (menu and footer) and `STATIC_PAGE_PATHS`. `STATIC_PAGE_PATHS` feeds three things: `app/sitemap.ts`, the middleware redirect lookup skip in `src/lib/redirects/lookup.ts` (`isRedirectCandidate`), and the Playwright page list in `tests/e2e/pages.ts`.
- An unlisted page must stay out of the menu and the sitemap, but should still skip the redirect database lookup and be covered by the e2e accessibility and design checks. So it gets its own set, `UNLISTED_PAGE_PATHS`, next to `STATIC_PAGE_PATHS`.
- Search engines: the page sets `robots: { index: false, follow: false }` in its Next.js metadata. Preview hosts already send `X-Robots-Tag: noindex` (next.config.ts).
- Contact: the existing `ContactForm` (`src/components/forms/contact-form.tsx`) is embedded in a `#request` section on the page, the same way the TouchUp page embeds `BookingForm`. The plan buttons link to `#request`. No change to the shared form.

## Task breakdown

1. `src/lib/site/navigation.ts` — add `UNLISTED_PAGE_PATHS` (`/services/seller-consulting`), with a comment that these pages are served but kept out of the menu and sitemap.
2. `src/lib/redirects/lookup.ts` — `isRedirectCandidate` returns false for `UNLISTED_PAGE_PATHS` too.
3. `app/(site)/services/seller-consulting/page.tsx` — the page:
   - Metadata: title "Seller consulting", description, `robots: { index: false, follow: false }`.
   - `PageIntro`: eyebrow "Services", H1 "Seller consulting", lead "Sell your home your way, with expert guidance at the steps you choose."
   - Section (page tone): H2 "Choose your level of support"; two cards in a 2-column grid from 768px (stacked on phones, Choice first):
     - Choice services: `surface-soft`, 2px `ink` top rule, eyebrow "Self-guided", H3, short description, "Includes:" row, five items with 18px check icons and `muted` detail lines, L secondary button "Ask for pricing" → `#request`.
     - Well advised: `tone-dark`, 2px `gold` top rule, gold eyebrow "Best Value", H3, description, "All of Choice services, plus:" row, four items with gold checks and `on-dark-muted` detail lines, L gold main button "Ask for pricing" → `#request`.
     - Buttons full width inside the card and aligned to the card bottom.
   - Add-ons (H3 "Optional add-ons", same section, max width 680px): "Add to either plan at any time." then four rows (icon, name, bold price; "per offer" suffix on the last), 1px `line` dividers under a 2px `ink` rule.
   - Section `#request` (soft tone): H2 "Ask for pricing", one line saying to name the plan and add-ons they're interested in, `ContactForm`.
   - All values from existing tokens and utilities (`type-*`, `btn`, `Eyebrow`, `Section`, `ICON_SIZE`); Lucide icons.
4. `docs/constitution/02-style-ui-ux.md` §11.10 — add a "Plan card" entry (§11.15 requires new components to be listed; the owner approved this design on 2026-09-26).
5. `docs/reference/site/navigation-reconciliation.md` — note the unlisted page.
6. Tests:
   - `src/lib/site/navigation.test.ts` — the unlisted page is not a menu or footer link and not in `STATIC_PAGE_PATHS` (so not in the sitemap).
   - `src/lib/redirects/lookup.test.ts` — `/services/seller-consulting` is not a redirect candidate.
   - `tests/e2e/pages.ts` — `PUBLIC_PAGE_PATHS` includes `UNLISTED_PAGE_PATHS`, so the existing axe and design-rule specs cover the page at phone and desktop sizes.
   - `tests/e2e/seller-consulting.spec.ts` — page has a `noindex` robots meta; `/sitemap.xml` does not list it; header and footer have no link to it; both plan buttons bring the pricing form into view; the page has one H1; "Best Value" is visible on the Well advised card.
7. Verify: `npm run typecheck`, `npm run lint`, `npm test`, `npm run design:check`, `npm run build`, Playwright on the new spec plus the accessibility and design-rule specs for the page; screenshots at 320, 375, 768, 1440.
8. Commit on `claude/agent-workflow-ux-setup-0527d8`, fast-forward merge into `build1`, push `build1` (it tracks `origin/build1` and is currently in sync).

## Assumptions

- The URL `/services/seller-consulting` is acceptable; it sits under Services like CWR TouchUp and can be added to the menu later by moving it into `MENU_SECTIONS` / `STATIC_PAGE_PATHS`.
- Plan prices are not shown; each card's button reads "Ask for pricing" and leads to the pricing form (owner decision; a separate price note was dropped after the 768px check showed longer "Ask about …" labels wrapping).
- Add-on prices are as in the owner's slide: MLS entry-only listing $300, professional photography $150, open house support $200, additional offer review $100 per offer.
- Copy is the audited Option A wording. The "Contract preparation" and "Best Value" wording still needs the broker-in-charge's review; that review does not block building a link-only page.
- Contact submissions from this page arrive in the admin inbox like any other contact message; the visitor names the plan in their message. No new inbox tag is added.
- Equal Housing and firm name already appear in the site footer, so they are not repeated on the page.

## DO NOT TOUCH

- `src/components/forms/*` (shared request forms, validation, submit actions)
- `app/sitemap.ts`, `app/robots.ts`, `middleware.ts`
- `MENU_SECTIONS` and `STATIC_PAGE_PATHS` contents
- `app/globals.css` tokens and utilities (no new tokens needed)
- Header, footer, mobile menu, action bar, chat components
- Any database migration or admin portal code

## Downstream Impact Analysis

### Level 1 — Direct
Files: `app/(site)/services/seller-consulting/page.tsx` (new), `src/lib/site/navigation.ts` (new export), `src/lib/redirects/lookup.ts` (`isRedirectCandidate`), `tests/e2e/pages.ts`, new/updated tests, two docs.
Functions/contracts affected: `isRedirectCandidate` (one more path returns false); `PUBLIC_PAGE_PATHS` (one more page).

### Level 2 — Dependent
Files: `middleware.ts` (calls the lookup; the new page skips the database lookup like other known pages), `tests/e2e/accessibility.spec.ts` and `tests/e2e/design-rules.spec.ts` (now also run on the new page), `app/sitemap.ts` (unchanged input, so the page stays out).
Risk: low. The redirect change only removes a database lookup for one path that has no stored redirect.

### Level 3 — Cascading
Files: Playwright CI run time (a few more page checks); the `/services` redirect to `/services/cwr-touchup` (trimming the new URL lands on TouchUp — acceptable, it does not reveal the unlisted page); admin inbox (receives contact messages from one more page, same form and schema).
Risk: none to low. No human approval items (no architecture, security, or external API change).
