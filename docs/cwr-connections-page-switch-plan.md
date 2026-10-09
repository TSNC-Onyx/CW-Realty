# Connections page on/off switch — plan (to-do item 4 of 8, 2026-10-09)

Status: APPROVED by owner 2026-10-09; BUILT on branch claude/website-updates-todo-5efd86. See "Build notes".

## Goal

An owner can hide the public Connections page from the website, and show it again, with one switch in Admin →
Connections; partner details stay saved either way.

Owner answers (2026-10-09): "There must be an option to hide the Connections page, must not be permanently
hidden/disabled"; switch back on with an "On/off switch in admin".

## What "hidden" means (proposed)

| Place | Showing (today) | Hidden |
|---|---|---|
| Header menu, phone menu, footer, "page not found" link list | "Connections" under Resources | Not listed; Resources keeps "FAQs & Homework" |
| `/connections` (bookmarks, Google, shared links, old `/sell` link) | The page | A **temporary** redirect (307) to the Resources page, so Google keeps the address for when it comes back |
| Sitemap | Listed | Not listed |
| Admin → Connections | Partners, editing, "View the Connections page" | Same editing (add, edit, reorder, photos), plus a notice "The Connections page is hidden from the website" in place of the "View" link |

## Scope

In scope: the switch, the public hiding above, tests, and a Style/Features note.

Out of scope: deleting or changing partner records; the chatbot policy text (owner content — see edge case 6);
the Resources page content; any other page.

## Architecture context

- Site-wide settings live in `cwr.site_settings` (one row; public read; owners/managers edit, audited). The public
  layout already reads it once per request (`fetchSiteSettings`, `app/(site)/layout.tsx`); if it can't load, the
  site renders with defaults.
- The menu, footer, and not-found page read `src/lib/site/navigation.ts`; the sitemap reads `STATIC_PAGE_PATHS`.
- Admin one-click switches use `QuickActionButton` + `runQuickAction` (toast with Undo), like Show/Hide on a
  partner.

## Task breakdown

1. Tests first:
   - Unit (`src/lib/site/navigation.test.ts`): menu, footer, and all-links lists drop Connections when hidden and
     keep it when shown; sitemap paths likewise (new pure `getListedPagePaths`).
   - pgTAP (`supabase/tests/database/060-site-settings.test.sql`): the new column exists, defaults to `true`, and
     the existing edit and audit rules cover it.
   - Playwright, in a new serial project `site-switches` that runs after the main suite (the switch changes the
     whole site): owner hides → menu, footer, and sitemap lack Connections; `/connections` lands on Resources;
     Admin shows the hidden notice; owner shows again → all back. Undo in the toast restores it. A manager sees
     the status but no switch. axe + design checks on Admin → Connections in both states.
2. Migration `supabase/migrations/20261009000100_cwr_connections_page_switch.sql`: `alter table cwr.site_settings
   add column is_connections_page_visible boolean not null default true`. Default true = no change on deploy.
3. `src/lib/site/site-settings.ts`: read the column into `SiteSettings.isConnectionsPageVisible`; when settings
   can't load, the page counts as showing (today's behavior).
4. `src/lib/site/navigation.ts`: `getMenuSections({ isConnectionsPageVisible })`, and footer/all-links/listed-paths
   helpers take the same option; `MENU_SECTIONS` stays the full list.
5. Pass the menu into `site-header.tsx` → `desktop-nav.tsx` / `mobile-menu.tsx`, and into `site-footer.tsx`, from
   `app/(site)/layout.tsx`; `not-found.tsx` and `app/sitemap.ts` read the setting themselves.
6. `app/(site)/connections/page.tsx`: when hidden, `redirect("/resources")` (Next.js temporary redirect).
7. Admin: `src/lib/admin/connections/page-switch-actions.ts` — `setConnectionsPageVisibilityAction(isVisible)`,
   owners only, updates the column, refreshes the public layout and Admin → Connections. New
   `src/components/admin/connections/connections-page-switch.tsx`: status line + "Hide the Connections page" /
   "Show the Connections page" button with Undo; managers see the status only. Placed at the top of
   `app/admin/(portal)/connections/page.tsx`; the "View the Connections page" link there and on the partner edit
   page shows only while the page is showing. While hidden, if the published chatbot policy mentions
   "Connections" (the live one does, checked read-only 2026-10-09), the notice adds: "Your chatbot policy still
   mentions the Connections page — update it in Chatbot policy" with a link.
8. Docs: one line in `docs/constitution/03-features-navigation.md` (the Connections page can be hidden by an owner,
   owner choice 2026-10-09) and the problem catalog entry `connections.set_page_visibility`.
9. Full checks, apply the migration locally, screenshots of both states on phone and desktop, reload real content,
   independent review.

## Assumptions

- "Hidden" sends visitors to Resources (temporary), not a "page not found" — easy to reverse and not a dead end.
- Only owners flip the switch (matches the option chosen); managers keep editing partners.
- Production needs the one migration applied at release (adds a column; the site behaves the same until an owner
  hides the page).

## DO NOT TOUCH

- `cwr.connections` table, partner editing actions, photos, trash; `cwr.redirects` rows (the old `/sell` link keeps
  pointing at `/connections`, which then follows the switch).
- Other menu entries, the Resources page, chatbot code and policy text, contact settings form and its save action.

## Downstream Impact Analysis

### Level 1 — Direct
Files: new migration; `site-settings.ts`; `navigation.ts`; `layout.tsx`; `site-header.tsx`; `desktop-nav.tsx`;
`mobile-menu.tsx`; `site-footer.tsx`; `not-found.tsx`; `sitemap.ts`; `connections/page.tsx`; admin connections
page and edit page; new switch component and action; problem catalog; tests; Features doc line.

### Level 2 — Dependent
- Every public page renders the menu and footer. Risk: low — with the default (showing) the lists are identical
  to today (unit test compares them).
- The contact settings save writes `site_settings` with named columns only, so it never touches the new column.
  Risk: none (checked: `src/lib/admin/contact/actions.ts` upserts listed columns).
- Redirect middleware treats `/connections` as a site page either way (no database lookup). Risk: none.

### Level 3 — Cascading
- Google: a temporary redirect keeps the address on record; the sitemap stops listing it while hidden.
  Risk: low.
- Production database: one added column with a default. Risk: requires the owner's OK to apply at release
  (same as earlier migrations).
- Chatbot: the live published policy names the "Connections page"; while hidden the assistant could still
  mention it. Risk: owner content — the admin reminder in task 7 points the owner to update it.

## Sources

- Google Search Central, "Redirects and Google Search" (temporary vs permanent redirects) and "Build and submit a
  sitemap" (list only pages you want found).
- Nielsen Norman Group, "Menu-Design Checklist" (menus list only working destinations) and "Error Message
  Guidelines" (don't strand people on dead ends).
- OWASP Top 10:2025 A01 Broken Access Control (role checked on the server, not just hidden in the page).

## Build notes (2026-10-09)

- The public site reads the switch in its own small query (`src/lib/site/page-listing.ts`) instead of adding it to
  the contact-details query, so a release that reaches the website before its database update never hides the
  phone number; any problem reading the switch counts as "showing".
- Owners only is enforced twice: the server action (`OWNER_ROLES`) and a database guard
  (`cwr.guard_connections_page_switch`, like the chat assistant switch), so a manager can't hide the page even
  outside the website. pgTAP covers manager (blocked) and owner (allowed).
- The admin action lives in the existing `src/lib/admin/connections/actions.ts`.
- The chatbot reminder's check (`getIsConnectionsPageMentioned`) is unit-tested; publishing a test policy in the
  browser needs the full test-and-publish flow, so it isn't covered end to end.
- If the switch can't load on Admin → Connections, a "didn't load" notice shows in its place.
