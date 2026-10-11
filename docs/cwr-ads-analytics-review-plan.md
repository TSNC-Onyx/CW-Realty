# Ads & analytics review — plan (to-do item 3 of 8, 2026-10-09)

Status: APPROVED by owner 2026-10-09 and BUILT on branch claude/website-updates-todo-5efd86 (Part A commit
459f513; Part B in the following commit). See "Build notes" at the end for the differences from the plan.

## Goal

The owner knows exactly where Ads & analytics stands and has a plain-language, step-by-step guide to switch it
on safely; the website code is confirmed current with Google's and Meta's 2026 rules; and each ID field on the
every admin field that holds a saved value shows, right under it, whether that value is saved or still waiting
to be saved.

## Review findings (2026-10-09)

| # | Area | Finding | Status |
|---|---|---|---|
| 1 | Live site | Tracking is **off**: no Tag Manager container ID or Meta Pixel ID saved, no tag review yet, 0 tracked leads, 0 closed deals (read-only check of production) | Working as designed; nothing is tracked or broken |
| 2 | Privacy and consent | Nothing loads before the visitor agrees; Google Consent Mode v2 defaults to "denied"; Global Privacy Control turns advertising off; withdrawing consent deletes tracker cookies. All 14 tracking browser tests pass | A |
| 3 | Meta server connection | Uses Graph API v26.0, the current version (released July 29, 2026) | A — current |
| 4 | Google Ads closed-deal file | Google stopped *new* API uploads of offline conversions on June 15, 2026 (moved to Data Manager). This site uses a **downloaded file uploaded by hand**, which Google still accepts | A — not affected |
| 5 | Housing ad rules | No age, gender, ZIP, city, or address is sent; Meta gets only standard fields | A |
| 6 | Owner setup instructions | The setup steps live only inside a technical build plan (`docs/cwr-phase-6-analytics-consent-plan.md`, "Launch notes"); there is no plain-language guide | **Gap — fix in this item** |
| 7 | Admin page | "Ads & analytics" shows clear on/off status lines, owner-only editing, ID format checks, and the quarterly review reminder | A |

### Part B audit — after Save, does a field look saved and applied? (owner request 2026-10-09)

| # | What the owner sees today | Grade | Why |
|---|---|---|---|
| B1 | A green toast ("Saved. Visitors now see the cookie choices.") that closes after 6 seconds | B | Clear, but temporary; gone when the owner looks back at the field |
| B2 | "All changes saved." in small grey text in the Save bar at the bottom | C | Easy to miss; it also shows on a fresh page where nothing was ever saved |
| B3 | Status lines at the **top** of the page turn green ("Tracking: on after each visitor agrees") | C | Correct, but far from the fields; doesn't say *which* ID is live |
| B4 | The field itself looks identical before and after Save | D | No sign at the field that the value is stored and in use (NN/g heuristic 1, visibility of system status) |
| B5 | Typing `gtm-ab12cd3 ` saves as `GTM-AB12CD3`, but the box keeps showing the lowercase text until a reload | C | What's shown isn't exactly what's stored |

## Scope

In scope:
- New runbook `docs/runbooks/ads-analytics-setup.md`, written for a non-technical owner, matching
  `docs/runbooks/chatbot-launch.md` in style. Sections, each marked "skip if you don't use it":
  1. Before you start: which accounts you need (Google Tag Manager, Google Analytics 4, Google Ads, Meta
     Business), all owned by the business.
  2. Google Tag Manager: create the web container; turn on Consent Overview; add the Google tag (GA4) with
     built-in consent; add key events using the exact event names the site sends
     (`cwr_call`, `cwr_text`, `cwr_contact_form`, `cwr_booking_request`, `cwr_chat_question`,
     `cwr_chat_topic`, `cwr_chat_handoff`); Google Ads conversion tags requiring `ad_storage`, with
     enhanced conversions from the `user_data` field; Meta Pixel from the template gallery (no Custom HTML)
     sending `event_id` as its event ID and requiring `ad_storage`.
  3. Test with Tag Assistant preview: Reject sends nothing; Accept sends page views and events.
  4. Publish the container, then paste the container ID (and Pixel ID) on the Ads & analytics page.
  5. Meta server connection: create a never-expiring system-user access token; the developer adds it as the
     Worker secret `META_CAPI_ACCESS_TOKEN`; the status line turns green.
  6. Ad accounts: mark every Google Ads and Meta campaign as **Housing** (Special Ad Category); create a
     Google Ads conversion action named exactly **Closed deal** (import, from clicks); tag campaign links with
     UTM tags.
  7. Every month: record closed deals in the inbox, download the two files from Closed deals, upload them
     (Google Ads → Goals → Conversions → Uploads; Meta Events Manager → dataset → Upload offline events).
     Google ignores deals more than 90 days after the click; Meta needs a sale price.
  8. Every 3 months: the tag review, then "Mark tags reviewed".
  9. How to switch everything off: clear the container ID and save.
- One line in `README.md` under Configuration pointing to the new runbook.
- Update `docs/cwr-phase-6-analytics-consent-plan.md` "Launch notes" to point to the runbook (single source).
- **Part B — saved-state line under every admin field that holds a saved value** (owner, 2026-10-09: "these
  states must apply to all input fields in the admin/portal side"). Three states, same look everywhere:
  - **Saved**: green check + "Saved". On Ads & analytics it names the live ID: "Live on the website:
    GTM-AB12CD3" (Meta: "Saved: 1234567890").
  - **Not saved yet**: grey alert icon + "Not saved yet". On Ads & analytics: "Not saved yet — the website still
    uses GTM-AB12CD3", or "Not saved yet — saving will turn tracking off" when a saved ID is cleared.
  - **Nothing saved**: grey icon + "Nothing saved" for a blank field on an existing item (Ads & analytics:
    "Off — nothing saved"). On a brand-new item (nothing exists yet) untouched fields show no line; a field
    shows "Not saved yet" as soon as something is typed.
  - The line compares what's in the box with what the server stored (shown when the page loaded), ignoring spaces
    at the ends, and ignoring letter case on fields the server stores in one case (IDs, emails, state, slugs).
  - After every successful save, the form restarts from the stored values, so each box shows exactly what was
    saved (phone "(919) 555-1234", state "NC", price "225,000", "GTM-AB12CD3"), fixing B5 on every form.
  - Icon plus words (never color alone); each line is linked to its field so screen readers read it on focus; no
    announcement on every keystroke (the Save bar already announces "You have unsaved changes").

  Fields covered (inventory 2026-10-09):

  | Screen | Fields |
  |---|---|
  | Listings (new and edit) | all 10 detail fields; each photo's description box |
  | Contact settings | all 11 fields |
  | Team member (new and edit) | 6 fields + "Show on website" checkbox |
  | Connections (new and edit) | 5 fields, category, "Show on website" checkbox |
  | Homework video and download (new and edit) | title, description, link, group, delivery choice, checkboxes |
  | Ads & analytics | Container ID, Pixel ID |
  | Chat policy | policy text, each topic button's quick answer |
  | Inbox conversation | Closed deal date and sale price; "Assign to" |
  | Users & roles | each person's role |

  Not covered, and why (no saved value to confirm, or the field empties itself on purpose):
  - Sign-in, forgot password, set password, and authenticator code screens.
  - "Add" forms that clear after adding (Invite a user, Add alert recipient, Add a test question): the new item
    appears in the list below, which is the confirmation.
  - Reply and note boxes in the inbox (they send a message, then clear), and the chat test box (never saved).
  - Photo and file upload pickers (the uploaded photo or file itself is shown) and one-click buttons such as
    Show/Hide, Publish, Up/Down (they already change and show a toast).

Out of scope:
- Any public-website code change (the review found no code defect).
- The shared Save bar wording, and the screens listed under "Not covered".
- Creating or changing Google or Meta accounts, tags, or campaigns (owner's accounts; the guide explains how).
- Changing the "ask first" cookie banner approach (owner decision 2026-09-25, kept).

## Architecture context

Tracking is built (Phase 6, PR #9) and switched off until an ID is saved: `src/components/tracking/tracking.tsx`
renders nothing without a container ID. The admin page is `app/admin/(portal)/tracking/page.tsx`; key event
names come from `src/lib/tracking/data-layer.ts`; closed-deal files from `src/lib/tracking/offline-export.ts`.

## Task breakdown

1. Write `docs/runbooks/ads-analytics-setup.md` (sections above); take event names, file columns, and status-line
   wording directly from the code files named in Architecture context so nothing drifts.
2. Add the README pointer; replace the Phase 6 "Launch notes" body with a pointer to the runbook.
3. Check: every event name in the runbook matches `KeyEventName` in `data-layer.ts` (scripted grep); every admin
   label quoted matches the page text; links and headings render in GitHub preview.
4. Part B, tests first (Playwright, owner signed in, clean test data), one test per save pattern:
   - Ads & analytics: fresh "Off — nothing saved"; save `gtm-ab12cd3` → box shows `GTM-AB12CD3` and "Live on the
     website: GTM-AB12CD3"; type another ID → "Not saved yet — the website still uses GTM-AB12CD3"; retype the
     saved ID in lowercase → "Live" again; clear → "saving will turn tracking off"; a rejected value keeps "Live".
   - Contact settings: save phone `919.555.1234` → box shows `(919) 555-1234`, "Saved"; edit → "Not saved yet".
   - Listing edit: price `$225000` → `225,000`, "Saved"; a new listing shows no lines until typing.
   - Team member checkbox and connection category select: change → "Not saved yet"; change back → "Saved".
   - Homework download delivery choice; closed-deal price; photo description; user role; inbox assignee; chat
     policy text and one quick answer: edit → "Not saved yet"; save → "Saved".
   - Admin accessibility + design checks on every covered screen (existing `admin-accessibility.spec.ts`).
5. New pure `getSavedState({ current, saved, isNewItem, isCaseInsensitive })` in `src/lib/admin/saved-state.ts`
   (unit-tested in `saved-state.test.ts`) and a `SavedStateLine` component in
   `src/components/admin/saved-state.tsx` (lucide
   `CircleCheck` in `text-success`, `CircleAlert` in `text-muted`, `type-small` text in `ink`; optional custom
   wording for Ads & analytics).
6. Field components gain the line, on by default for covered forms via one prop on the form (`savedState`
   context from a small `SavedStateProvider` with `isNewItem`), so each field doesn't need wiring:
   `admin-field.tsx`, `admin-select.tsx`, `admin-checkbox.tsx` track their own typed value (uncontrolled stays
   uncontrolled) and render `SavedStateLine` linked by `aria-describedby`. Without the provider (auth and "add"
   forms) they render exactly as today.
7. Forms: wrap the 8 Save-bar forms and the closed-deal box in `SavedStateProvider`, and key each `<form>` on its
   saved values so it restarts from what was stored after a successful save. Raw fields (download delivery radio
   group, photo description, user role, inbox assignee) and the two controlled editors (policy text, quick
   answers) render `SavedStateLine` directly from the dirty checks they already have or a one-line comparison.
8. Ads & analytics: custom wording; `getCleanTrackingId` in new `src/lib/admin/tracking/tracking-id.ts` shared
   by `tracking-schema.ts` and the page (no form library added to the page's script).
9. `docs/constitution/02-style-ui-ux.md` §11.11: add the "Saved-state line" rule (owner choice 2026-10-09) next
   to the Valid rule, which otherwise limits check marks to fields that were in error.
10. Full checks (typecheck, lint, design check, unit, full browser suite on clean test data), screenshots of the
    three states on phone and desktop for Ads & analytics, Listings and Contact settings, reload real content,
    then independent review against this plan.

## Assumptions

- The owner (or a helper) will do the account steps; the website needs no change to switch on.
- Visitors are mainly in the US; the existing "ask first" banner stays.

## DO NOT TOUCH

- All code under `app/(site)/`, `src/lib/tracking/`, `src/components/tracking/`, `supabase/`; `save-bar.tsx`;
  every server action and database write (saving works exactly as today); auth forms and "add" forms;
  `wrangler.jsonc`; the production database and settings. Part B touches only admin form components and the
  files named in tasks 4–9.
- `docs/constitution/*`; the Phase 6 plan's decisions and verification sections (only "Launch notes" is
  replaced with a pointer).

## Downstream Impact Analysis

### Level 1 — Direct
Files: new `docs/runbooks/ads-analytics-setup.md`, `README.md` (one line), Phase 6 plan "Launch notes"; new
`src/lib/admin/saved-state.ts` (+ test), `src/components/admin/saved-state.tsx`; `admin-field.tsx`,
`admin-select.tsx`, `admin-checkbox.tsx`; the 8 Save-bar forms, `closed-deal-box.tsx`, `listing-photos.tsx`,
`user-list.tsx`, `thread-controls.tsx`, `quick-answer-editor.tsx`, `policy-editor.tsx`,
`download-details-form.tsx`; `tracking-id.ts`, `tracking-schema.ts`; new Playwright tests; Style §11.11.

### Level 2 — Dependent
Files: auth forms, "add" forms, and photo pickers also render `AdminField` / `AdminSelect`.
Risk: none — without `SavedStateProvider` the fields render byte-for-byte as today (checked by the existing
login, invite, recipient and photo tests). Server actions are unchanged, so saving behaves exactly as before.
Risk: low — re-keying a form after a successful save resets its typed text to the stored values; a failed save
keeps the typed text (key unchanged), so nothing typed is lost on errors.

### Level 3 — Cascading
Admin accessibility and design checks run on Ads & analytics (`admin-accessibility.spec.ts`): the new line uses
existing tokens and icon sizes. The owner following the guide switches on tracking in production. Risk: requires the owner's own action and
accounts; the guide's test step (Tag Assistant: Reject sends nothing) guards against tags that ignore consent.

No item needs extra human approval (no architecture, security, or outside-service change in code).

## Sources

- Google Ads Help, "About offline conversion imports" (support.google.com/google-ads/answer/2998031) and
  PPC Land, "Google blocks new offline conversion imports via Ads API from June 15" (2026).
- Meta for Developers, Graph API versions changelog (developers.facebook.com/docs/graph-api/changelog/versions).
- Google, Consent Mode v2 developer guide; W3C Global Privacy Control.
- Meta Business Help, Special Ad Categories (housing).
- Nielsen Norman Group: "10 Usability Heuristics" (#1 visibility of system status) and "Indicators, Validations,
  and Notifications: Pick the Correct Communication Option" (contextual, persistent indicators for state).
- WCAG 2.2: 1.4.1 Use of Color, 1.3.1 Info and Relationships (status tied to its field), 4.1.3 Status Messages.

## Build notes (2026-10-09)

- Restarting forms after a save: instead of keying each form on its saved values, `useAdminForm` now returns a
  `savedVersion` that changes after every successful save, and the 7 Save-bar forms key their fields (a keyed
  `Fragment`, not the whole form, so the Save button keeps keyboard focus) on it. This also
  refreshes a box when the stored value didn't change but its text did (saving `gtm-ab12cd3` over
  `GTM-AB12CD3` shows `GTM-AB12CD3`), and never wipes typed text on a failed save or an unrelated page refresh.
  The closed-deal box (no `useAdminForm`) keeps its own save counter the same way.
- No `tracking-id.ts` helper was needed: the field's `isCaseInsensitive` comparison matches the server's
  uppercase clean-up, and the save action is untouched.
- Rows outside a form (photo description, user role, inbox assignee) use `useTypedValue`, which follows the saved
  value after each save; an unassigned conversation reads "Not assigned yet".
- Look: "Not saved yet" uses an `ink` alert icon and 600 `ink` text (stronger than the grey first proposed, so
  changed fields stand out), and "Nothing saved" a `muted` dashed circle; Style §11.11 records exactly this. The
  §11.11 line is the one planned constitution edit (task 9), an exception to the DO NOT TOUCH list.
- Only fields the server stores in one letter case ignore capitals: Ads & analytics IDs, listing state and web
  address, office state, license number, team and connection emails, team web address. The contact email is
  stored as typed, so capitals count there.
- Browser tests (`tests/e2e/admin/saved-state.spec.ts`, 10 tests, plus one in `tracking.spec.ts`) cover new
  listing, listing edit with price clean-up, letter case, checkbox + select, contact settings, user role,
  download delivery choice, chat policy text, closed deal re-save, Save-button focus after a save, sign-in (no
  lines), and the Ads & analytics wording including a rejected ID. The contact
  test doesn't save (site-wide settings are shared by other tests running at the same time). Photo description,
  assignee, and quick answers use the same tested pieces and were checked in review.
