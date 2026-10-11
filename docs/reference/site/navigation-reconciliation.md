# Navigation Reconciliation

Reconciles `CWR-sitemap.xml` and `CWR-routes.ts` (the owner's redirects file) against Constitution sections 1–3. The two source files are kept unchanged as the historical reference; this document is the working source of truth for pages, menu, and redirects.

## Findings

| # | Issue in source files | Resolution |
|---|---|---|
| 1 | Listing and team pages are hard-coded, but the admin portal must let the manager change them without a developer | Listings and team members are database records managed in the admin portal; the 4 listings and 10 team members below are the launch seed. The sitemap is generated from fixed pages + published records |
| 2 | Listing URL patterns differ: one ends in a ZIP, one has no city | One pattern: `/listings/{street}-{city}-nc`. `3826-burlington-rd-greensboro-nc-27405` → `3826-burlington-rd-greensboro-nc`. `912-rocky-meadows-ln` keeps its current slug (owner decision) |
| 3 | `/services/cwr-touchup` has no `/services` parent, so trimming the URL returns a 404 | `/services` redirected to `/services/cwr-touchup` until a second service existed. Since 2026-09-26 (Property Management added) `/services` is an overview page of both services |
| 4 | "Homework" (at `/resources`, formerly `/faq`) is an unclear menu label (NN/g: plain words) | Menu label "FAQs & Homework"; page keeps the "Homework" heading; URL stays `/resources` |
| 5 | "Connections" (formerly `/sell`) sits under Resources while its old URL suggests a sellers page | Confirmed by owner: a referral directory of partner professionals (insurance agents, loan officers, etc.); stays under Resources, `/sell` keeps redirecting to it |
| 6 | Sold listings and departed team members would leave dead links | Sold listings stay live with a "Sold" label; a hidden team member's page temporarily redirects (302) to `/team` and returns when un-hidden; when the manager deletes a listing or team member, their URL permanently redirects (301) to `/listings` or `/team`. Changing a slug in the admin portal creates a redirect automatically |
| 7 | Redirects only cover exact old paths | Also normalize: `http`→`https`, bare domain→`www`, uppercase→lowercase, trailing slash removed, `/home`→`/`. Every redirect is a single hop (no chains) and permanent (301) |
| 8 | No 404, admin, or legally required pages listed | Add a 404 page (search + menu), `/admin` (not indexed, not in sitemap), an Equal Housing Opportunity line in the footer, and a footer link to the NC Real Estate Commission "Working with Real Estate Agents" disclosure, plus a "Cookie settings" control |
| 9 | Existing database property records (25) do not match the 4 real listings and use test-style slugs (`mgp-001`) | Treated as demo/seed data: not imported into the new site, left untouched in place |

## Menu (6 top-level items; Home added by owner choice 2026-09-26)

| Menu item | Contains |
|---|---|
| Home | Home page (`/`); the footer reaches it through the logo instead of a column |
| Listings | Featured properties (`/listings`), Property search (`/property-search`) |
| Services | Selected services (`/services/selected-services`, owner choice 2026-10-02), CWR TouchUp (`/services/cwr-touchup`), Property management (`/services/property-management`); overview at `/services` |
| Team | `/team` and member pages (the footer link reads "CWR team") |
| Resources | FAQs & Homework (`/resources`), Connections (`/connections`; an owner can hide it, which drops it here and sends its address to `/resources` — `docs/cwr-connections-page-switch-plan.md`) |
| About | About us (`/about`), Contact (`/contact`) |

Link-only pages (`UNLISTED_PAGE_PATHS` in `src/lib/site/navigation.ts`): none at the moment. The former link-only Seller consulting page became the listed Selected services page on 2026-10-02; `/services/seller-consulting` redirects there (301, `next.config.ts`).

Always visible on mobile, outside the menu: Call, Text, Chat. Footer: all of the above except Home, plus links to Privacy policy, Cookie settings, and NC "Working with Real Estate Agents", and an "Equal Housing Opportunity" line (text, not a link).

## Pages and redirects

| New path | Old paths redirected here |
|---|---|
| `/` | `/home` |
| `/about` | `/about-us` |
| `/contact` | — |
| `/privacy-policy` | — |
| `/team` | `/support-team` |
| `/team/charlie-ward` | `/charlie-ward` |
| `/team/ashley-edwards` | `/copy-of-russell-casey` |
| `/team/jerome-pappas` | `/jerome-pappas-broker` |
| `/team/ryan-dixon` | `/ryan-dixon-cwr` |
| `/team/cherri-dixon` | `/cherri-dixon-cwr` |
| `/team/herita-jones` | `/herita-jones` |
| `/team/princess-garner` | `/copy-of-princess-garner` |
| `/team/richard-chitman` | `/richard-chitman` |
| `/team/jayne-trinette` | `/jayne-trinette-cwr` |
| `/team/russell-casey` | `/russell-casey` |
| `/listings` | — |
| `/listings/5423-pine-level-dr-browns-summit-nc` | `/5423pineleveldr` |
| `/listings/1514-woodridge-ave-greensboro-nc` | `/1514woodridgeave` |
| `/listings/912-rocky-meadows-ln` | `/rocky-meadows-lane` |
| `/listings/3826-burlington-rd-greensboro-nc` | `/3826-burlington-rd-greensboro-nc-27405`, `/listings/3826-burlington-rd-greensboro-nc-27405` |
| `/property-search` | — |
| `/services` | — (overview page since 2026-09-26) |
| `/services/selected-services` | `/services/seller-consulting` (301, `next.config.ts`) |
| `/services/cwr-touchup` | `/cwrtouchup` |
| `/services/property-management` | — |
| `/connections` | `/sell` |
| `/resources` | `/faq` |

## Owner decisions (2026-09-25)

| Topic | Decision |
|---|---|
| Property Search | Triad NC MLS search, likely via an embed; ship a placeholder until the provider is chosen |
| Bookings | Only CWR TouchUp appointments are bookable; "booking" events track TouchUp bookings |
| Stripe | No payments on the site; the Section 1 Stripe webhook rule does not apply unless payments are added later |
