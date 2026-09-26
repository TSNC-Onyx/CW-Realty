# Phase 6 — Analytics & Consent — Plan

Status: **built** (2026-09-25) on branch `phase-6-analytics-consent` (from `build1`); merged into `build1` as PR #9 (all checks passed).
Parent plan: `docs/cwr-website-build-plan.md` (Phase 6, tasks 20–21).

## Goal

Visitors choose, in a cookie banner, whether the site may use analytics and advertising cookies; only after they agree do Google Tag Manager (GA4, Google Ads) and the Meta Pixel load. Calls, texts, forms, chats, and bookings are measured as key events, leads are also sent to Meta from the server, closed deals can be downloaded for Google Ads and Meta, and the privacy policy lists every tracker and how the chat uses visitor data.

## Scope

**In scope**
- Task 20: cookie banner (Style §11.13) with "Accept all", "Reject all", and "Cookie settings" (two choices: Analytics, Advertising); Google Consent Mode v2; Global Privacy Control; Google Tag Manager web container (optionally served by the owner's server-side tagging container); Meta Conversions API from the server with a shared event ID for Pixel dedupe; Google Enhanced Conversions data; key events; closed-deal recording and export files for Google Ads and Meta.
- Owner-only admin area "Ads & analytics": Tag Manager container ID, Meta Pixel ID, server-connection status, and the quarterly tag review (Features §4).
- Owner/manager "Closed deals" area: list and download; "Closed deal" box on each inbox conversation.
- Task 21: privacy policy lists every tracker, every kind of storage, and the chat's data use.

**Out of scope**
- Building tags inside Google Tag Manager, Google Ads, or Meta (done in those accounts; setup steps are listed under Launch notes).
- Hosting the server-side tagging container (Google Cloud or a host such as Stape; owner's account). The site only points at it.
- Automatic uploads to the Google Ads or Meta APIs (files are downloaded and uploaded by hand; decision 11).
- Ad campaign targeting (the housing ad rules are account settings in Google Ads and Meta; decision 13 covers what the site sends).

## Resolved decisions

| # | Question | Decision | Source |
|---|---|---|---|
| 1 | Consent style | Google's "basic" consent mode: nothing Google or Meta loads until the visitor agrees. Consent Mode v2 `default` (all four types denied) then `update` run before Tag Manager starts | Features §4 "no tracking fires before consent"; Google consent guide |
| 2 | Choices | Two: **Analytics** (`analytics_storage`) and **Advertising** (`ad_storage`, `ad_user_data`, `ad_personalization`, Meta). "Accept all" and "Reject all" are equal gold S buttons; "Cookie settings" opens a native `<dialog>` with two switches and Save | Style §11.13, reference `components-messages-content.html` |
| 3 | Where the choice is kept | First-party cookie `cwr_consent` (`{v, analytics, ads, at}`), 180 days, `SameSite=Lax`, `Secure` on https. A cookie (not browser storage) so the server can read it for Meta and attribution, and so the banner is rendered on the server without flashing. Bumping `v` asks everyone again | Infra §2; industry practice (re-ask at least yearly) |
| 4 | Global Privacy Control | `Sec-GPC: 1` header (server) or `navigator.globalPrivacyControl === true` (browser) switches Advertising off and locks its switch, with a sentence saying why; "Accept all" then grants Analytics only. The server never sends Meta events or saves ad click IDs when GPC is on | Features §4; W3C GPC |
| 5 | When nothing is set up | No Tag Manager ID saved → no banner, no scripts, and "Cookie settings" links to the privacy policy's cookie section. The site works exactly as today | Owner answer 2026-09-25 ("approve both, switched off") |
| 6 | Where the IDs live | New table `cwr.tracking_settings` (one row): `gtm_container_id`, `meta_pixel_id`, `tags_reviewed_at`. Owner-only edits (a Tag Manager container can run any script on the site). Public read (both IDs are public in page source anyway). Meta access token is a Worker secret `META_CAPI_ACCESS_TOKEN`; optional server-side tagging address is a Worker variable `TAG_SERVER_URL` because the security policy (CSP) is built before any database read | Admin §7, Infra §2 |
| 7 | Security policy (CSP) | Public pages allow Google's documented hosts for Tag Manager, GA4 (with ads features), Google Ads, and Meta in `img-src`, `connect-src`, `frame-src`; plus `TAG_SERVER_URL`'s origin when set. Admin pages unchanged. Tag Manager gets the page nonce (Google's nonce-aware snippet), so its own scripts are trusted through `'strict-dynamic'` | Google CSP guide |
| 8 | Key events | Pushed to the Tag Manager data layer only after consent, each with an `event_id`: `cwr_call` and `cwr_text` (any phone/text link), `cwr_contact_form`, `cwr_booking_request`, `cwr_chat_question` (question answered), `cwr_chat_handoff` ("Talk to a person" sent) | Features §3; Phase 5 handoff |
| 9 | Meta server events | For the three server-confirmed leads (contact → `Lead`, chat hand-off → `Lead`, TouchUp request → `Schedule`), the server sends a Conversions API event (Graph API v26.0) after replying to the visitor, only when Pixel ID + token exist, the visitor allowed Advertising, and GPC is off. `event_id` = the form's one-time key, so a double submit is one event and the Pixel event from Tag Manager dedupes against it. One try, 5-second limit, failures logged by error name only | Features §3; Meta CAPI docs |
| 10 | Google Enhanced Conversions | After a lead is sent (Advertising allowed), the server returns SHA-256 hashes of the email and phone (Google's normalization) and the browser adds them as `user_data.sha256_email_address` / `sha256_phone_number` on the event. Plain email/phone never enter the data layer | Google EC docs |
| 11 | Closed deals | Owners/managers record "Closed deal" (date + optional sale price) on an inbox conversation. "Closed deals" page downloads a Google Ads file (legacy offline template: `Parameters:TimeZone=America/New_York`, Google Click ID, hashed Email, hashed Phone Number, Conversion Name "Closed deal", Conversion Time, Value, Currency, Ad User Data, Ad Personalization) and a Meta file (email, phone, event_name `Purchase`, event_time, value, currency, fbc, fbp). Only leads that allowed Advertising are included; the Meta file skips deals without a sale price (Meta requires a Purchase value). Meta's server API rejects events older than 7 days, so files — not the API — are used | Features §3; Google/Meta limits |
| 12 | Click IDs | On landing, the site reads `gclid`, `gbraid`, `wbraid`, `fbclid`, and `utm_*` into memory. Only after Advertising is allowed are they kept in this tab (`sessionStorage` `cwr-attribution`) and sent with a form. The server saves a `cwr.lead_attribution` row only if its own consent check agrees — even with no click IDs, since the row also records that the lead allowed Advertising. Values are checked against strict patterns | Features §3; OWASP input validation |
| 13 | Housing ad rules | The site never sends age, gender, ZIP, city, or address to Google or Meta; Meta events carry only standard fields and the page address without its query string. Special Ad Category is an account setting (Launch notes) | Features §3 |
| 14 | Removing consent | Turning a choice off saves it, deletes known tracker cookies (`_ga*`, `_gcl*`, `_fbp`, `_fbc`, `FPLC`), clears saved click IDs when Advertising is turned off, and reloads the page so no script keeps running | GDPR/CPRA practice |
| 15 | Deleting a closed deal | Soft delete into the 30-day trash like other items (restore / owner delete forever) | Admin §7 |
| 16 | Tag review | "Mark tags reviewed" button on Ads & analytics; the dashboard card says when a review is due (over 90 days) | Features §4 "review tags quarterly" |

## Architecture context

- `app/(site)/layout.tsx` reads tracking settings (cached, fails closed to "off"), the consent cookie, and `Sec-GPC`, and renders `ConsentManager` (banner + settings dialog + Tag Manager loader) only when a container ID exists.
- `src/lib/tracking/` holds pure, tested logic: consent cookie format, data-layer events, attribution parsing, hashing/normalization, CSV building, Meta event building.
- Form server actions (`submit-actions.ts`, `chat-handoff.ts`) read consent on the server (`fetchAdConsent()`), pass attribution to `submitNewRequest`, schedule the Meta event with `after()`, and return `conversion` data in the form state; `useRequestForm` pushes the key event when a form is sent.
- Admin areas follow existing patterns: `runAdminAction` + `SaveBar` for settings, `runQuickAction` for the closed-deal box, route handlers for file downloads (role-checked).

## Task breakdown

1. Migration `20260925001600_cwr_tracking.sql`: `cwr.tracking_settings` (+ seed row, RLS public read / owner insert+update, audit), `cwr.lead_attribution` (service writes, editor reads, audit with click IDs redacted, cascades with its thread), `cwr.closed_deals` (editor CRUD by RLS, soft delete, audit), trash view + `purge_trash()` include closed deals. pgTAP `120-tracking.test.sql`.
2. `src/lib/tracking/`: `consent.ts` (cookie parse/serialize, GPC rules), `data-layer.ts` (gtag consent + events), `attribution.ts` (parse, store), `hashing.ts` (Google + Meta normalization, SHA-256), `meta-conversions.ts` (build + send), `offline-export.ts` (CSV), `tracking-settings.ts` (public fetch), `server-consent.ts` (cookie + header on the server). Unit tests for each pure module.
3. CSP: `content-security-policy.ts` gains a public-page tracker option; `middleware.ts` passes `isAdmin` and `TAG_SERVER_URL`. Tests.
4. Components `src/components/tracking/`: `consent-manager.tsx` (banner, dialog, loader, phone/text click events), `cookie-settings-link.tsx`. Footer + privacy page use the link. Layout wiring.
5. Forms and chat: hidden `attribution` field; `RequestFormState.conversion`; server consent + attribution + Meta event in `submit-actions.ts` and `chat-handoff.ts`; `submitNewRequest` saves attribution; key events in `useRequestForm` and `useChatConversation`.
6. Admin: `app/admin/(portal)/tracking/page.tsx` + `src/lib/admin/tracking/*` + `src/components/admin/tracking/*`; closed-deal box on `inbox/[id]`; `app/admin/(portal)/closed-deals/page.tsx` + download routes; navigation, dashboard lines, trash support.
7. Privacy policy rewrite (task 21).
8. `README.md` and a `wrangler.jsonc` comment document `META_CAPI_ACCESS_TOKEN` and `TAG_SERVER_URL` (`.env.example` was not editable in this session; add both there).
9. Tests: unit, pgTAP, Playwright (banner shown only when configured, equal buttons, reject loads nothing, accept loads Tag Manager with nonce, GPC locks advertising, settings dialog keyboard/Escape, withdrawal reload, banner does not cover launcher or action bar, cookie link fallback, owner-only Ads & analytics, closed deal record/trash/export, privacy policy content, axe).

## Assumptions

- The owner (or their agency) builds the tags inside Tag Manager using the event names in decision 8 and the setup steps in Launch notes.
- Visitors are mainly in the US; the banner is shown to everyone (opt-in everywhere), which satisfies the strictest rule.
- Leads recorded before this phase have no attribution and are never exported.
- Currency is US dollars.

## DO NOT TOUCH

Parent-plan list (incl. Google Workspace records, `docs/constitution/*`, design reference); migrations up to `20260925001500`; pgTAP `000`–`110`; chat answer pipeline (`answer-question.ts`, `assistant-*`, `restricted-data.ts`); `wrangler.jsonc` rate limits and queues.

## Edge cases (most → least critical) and solutions

| # | Edge case | Solution |
|---|---|---|
| 1 | Tracking fires before the visitor agrees | Nothing loads until a choice grants it; consent defaults are "denied"; Playwright checks that no Google/Meta request happens before Accept or after Reject |
| 2 | Visitor's browser sends "do not sell/share" (GPC) | Advertising stays off and cannot be switched on; the server double-checks the header before Meta events or click IDs |
| 3 | A manager pastes a Tag Manager ID they don't control, which could run any script | Only owners can change IDs; the page warns in plain words; every change is in the audit log |
| 4 | Personal data leaks to ad platforms in readable form | Only SHA-256 hashes of email/phone leave the site; no names, addresses, ZIPs, ages, or chat text; page address sent without its query string |
| 5 | Visitor changes their mind later | Cookie settings is in every footer; turning a choice off deletes tracker cookies, clears click IDs, and reloads |
| 6 | Meta counts one lead twice (Pixel + server) | Both use the same `event_id`; a double submit reuses the form's one-time key |
| 7 | Meta or Google is slow or down | Meta event runs after the visitor's reply, with a 5-second limit; failures never touch the form or inbox |
| 8 | Someone fakes click IDs or huge values in a form | Strict patterns and length limits; anything else is dropped; the lead itself still saves |
| 9 | Banner covers the chat launcher or phone action bar | Desktop: banner sits bottom-left with room for the launcher; phone: banner sits directly above the action bar |
| 10 | Nothing configured yet / database down | No banner, no scripts; "Cookie settings" opens the privacy policy; site works as before |
| 11 | Closed deal recorded on the wrong conversation | Move it to the trash (restorable for 30 days) or edit it |
| 12 | Closed deal is too old for Google (90 days after the click) or Meta | The Closed deals page explains the limits; files include every eligible deal and the platform ignores stale rows |
| 13 | Storage blocked (private windows) | Consent still works for the page view; click IDs simply aren't kept |
| 14 | Tag review forgotten | Dashboard shows "Tag review due" after 90 days |

## Downstream Impact Analysis

### Level 1 — Direct
New migration; `src/lib/tracking/*`; `src/components/tracking/*`; `content-security-policy.ts`; `middleware.ts`; `app/(site)/layout.tsx`; `site-footer.tsx`; `privacy-policy/page.tsx`; `form-state.ts`; `submit-actions.ts`; `intake.ts`; `chat-handoff.ts`; `use-request-form.ts`; `request-form.tsx`; `chat-handoff-form.tsx`; `use-chat-conversation.ts`; admin navigation, dashboard, trash, inbox thread page; new admin pages; `.env.example`.

### Level 2 — Dependent
- Every public page's CSP gains Google/Meta hosts. Risk: low — scripts still need the nonce; admin CSP unchanged.
- `RequestFormState` gains an optional field used by contact, booking, and chat hand-off forms. Risk: low — covered by existing Playwright form tests.
- `submitNewRequest` gains optional attribution. Risk: low — attribution failure is logged and never blocks the lead.
- Trash view gains a row type. Risk: low — trash list and actions updated together; pgTAP covers the view.

### Level 3 — Cascading
- Google and Meta receive visitor data (owner-approved 2026-09-25, switched off until IDs are entered). Risk: requires plan entry — Launch notes list the account settings the owner must make (Special Ad Category, consent checks on every tag).
- Lighthouse budgets: nothing loads without consent, so CI (no consent) is unaffected; with consent, Tag Manager adds third-party weight the owner controls. Risk: low.

## Launch notes (for the Phase 7 runbook)

- Ads & analytics page: paste the Tag Manager container ID (`GTM-…`) and Meta Pixel ID.
- Worker secret `META_CAPI_ACCESS_TOKEN` (Meta Events Manager → Conversions API → access token). Optional Worker variable `TAG_SERVER_URL` (server-side tagging address, e.g. `https://data.charliewardrealty.com`); add it to every Wrangler environment (including `env.preview` when it exists).
- In Tag Manager: set every Google Ads and Meta tag to require `ad_storage` consent (Consent Overview); GA4 tags use built-in consent. Trigger tags on the event names in decision 8; the Meta Pixel tag must send `event_id` as its eventID. Map `user_data` for Google Ads Enhanced Conversions. Avoid Custom HTML tags (the security policy may block them); use gallery templates.
- In Google Ads: a conversion action named exactly **Closed deal** (import, clicks). In Meta and Google Ads: mark campaigns as Housing (Special Ad Category).
- Tag every campaign link with UTM tags.

## Known exceptions (owner decisions)

- The "Cookie settings" dialog is a new component; Style §11.15 asks for it to be added to §11.13 with owner approval before it ships.
- Meta server events are sent once (5-second limit) without the queue's retry and dead-letter handling that Infra §3 asks for; losing one ad event never affects the lead.
- GBRAID/WBRAID click IDs are saved but not exported (Google's CSV header for them is unconfirmed).

## Verification (2026-09-25)

| Check | Result |
|---|---|
| Unit tests | 295 passed (consent cookie, GPC, click-ID checks, hashing, Consent Mode order, Meta event, CSV files, CSP, admin rules, server GPC re-check) |
| Database tests (fresh database) | 142 passed (13 files, incl. new `120-tracking`) |
| Playwright | 257 passed, incl. a separate `tracking` project that runs last: nothing loads before a choice, Reject keeps trackers off, Accept loads Tag Manager with the nonce after "denied" defaults, call tap event, withdrawal deletes cookies and reloads, GPC, Escape/focus, banner clear of launcher and action bar, axe + design checks on phone and desktop, click IDs saved only with consent; closed deals, trash, staff blocked, owner-only Ads & analytics, privacy policy content |
| lint, typecheck, design:check, db:check, db:lint, Workers build + `wrangler deploy --dry-run` | pass |
| Lighthouse (home, desktop) | performance, accessibility, best practices 100; page scripts 155 KB (budget 200 KB) |
| Independent review | 0 high; 2 medium (no consent row for leads without an ad click; no server GPC test) and 11 low — fixed except the three owner decisions above and Gmail "+tag" handling (kept, per Google's current API guide); re-review found 1 low test weakness — fixed |

Found and fixed while testing: the form library (zod) had been pulled onto every page by the cookie code (+90 KB of script), so the consent and click-ID checks use plain code; an icon passed from a server page to a client button crashed Ads & analytics.
