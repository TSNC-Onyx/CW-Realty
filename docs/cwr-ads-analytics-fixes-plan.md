# Ads & analytics audit fixes — plan

Status: APPROVED by owner 2026-10-21 (chat: apply fixes for all) — BUILDING

- **Owner request:** on 2026-10-21 the owner asked to "apply fixes for all" twelve findings from the audit of
  Admin → Ads & analytics. That request approves the scope below, including the two items that the
  strict-process Human Approval Gate would otherwise stop on: a new outgoing call from the server to Google
  (finding 1) and a new public endpoint that sets cookies (findings 7–8). The owner still has to approve this
  plan before any code is written.
- **Hard limits for the implementer:** no production database changes, no deploys, no pushes, no merges, no
  Cloudflare secret or variable changes. A new migration is written as a file and applied only to the local
  database. Never put chatbot policy text in a commit.
- **Branch / base:** `claude/ads-analytics-audit-pixel-google-dde950`, based on `build1` at `0f24000`.
- **Related plans:** `docs/cwr-phase-6-analytics-consent-plan.md` (decisions 1–16, the design this plan
  changes), `docs/cwr-ads-analytics-review-plan.md` (the runbook and saved-state lines),
  `docs/runbooks/ads-analytics-setup.md` (the owner's guide this plan extends).

## Goal

After this change, the Ads & analytics page tells the owner the truth (an unpublished Tag Manager container, a
broken Meta connection, and where the browser Pixel lives are all shown in plain words), ad clicks keep their
click codes across pages, tabs, and Safari's 7-day limit, and the setup guide covers every Google and Meta
setting the audit found missing, while nothing still tracks a visitor before they agree.

## Scope

**In scope (one line per audit finding, most to least critical)**

| # | Finding | Fix in this plan |
|---|---|---|
| 1 | A typo'd or unpublished container ID shows "on" while nothing records | Server asks Google for the container's script on save and on each page load (3-second limit); the save message and the status line say "published", "Google can't find it", or "couldn't check"; saving is never blocked |
| 2 | The Pixel ID field reads as if it adds the browser Pixel | Field help and a new status line say the browser Pixel is set up inside Tag Manager; this field only powers the Meta server connection |
| 3 | The admin Pixel ID can differ from the one in Tag Manager | "Must match the Pixel ID in Tag Manager" beside the saved ID; the quarterly-review text and runbook §8 add the check |
| 4 | Consent given after moving to another page loses `gclid`/`gbraid`/`wbraid`/`fbclid` from the address before Tag Manager starts | Before Tag Manager starts with Advertising allowed, put the landing click IDs back in the address (only missing ones; nothing else changes) |
| 5 | Meta server events use only the `_fbc` cookie | Use the click value already built from the saved `fbclid` when `_fbc` is missing |
| 6 | Meta failures are silent | Each failure is recorded as a problem; a new background check `meta_conversions` keeps the last success and last failure; the page shows "last lead sent to Meta …" or "not working"; the dashboard warns while it is failing |
| 7 | Safari keeps the script-written consent cookie only 7 days | A new same-site endpoint re-issues the same cookie from the server; the browser keeps writing its own copy first, so a failed call changes nothing |
| 8 | Click IDs live only in one tab | After Advertising is allowed, the same endpoint keeps them in a first-party cookie `cwr_attribution` (up to 90 days from the ad click); it is deleted when Advertising is refused or withdrawn; the server uses it when a form's hidden field is empty; the privacy policy lists it |
| 9 | Advertising allowed after Analytics doesn't re-fire ad tags on that page | Push a `cwr_consent_update` data-layer event whenever a category is newly allowed after Tag Manager started; the runbook adds it as a second trigger (fire once per page) on GA4 and ad tags |
| 10 | Runbook lacks the Conversion Linker and a Google tag with the Google Ads ID (`AW-…`) | Runbook steps |
| 11 | Runbook lacks "turn on enhanced conversions and accept the customer data terms" | Runbook step before the first closed-deal upload |
| 12 | Basic consent mode undercounts | Keep basic mode (required by Features §4); explain the trade-off in the runbook's "Why the numbers look lower" |
| 13 | Retargeting setup is not covered (audit note) | Runbook section: link GA4 and Google Ads, Google signals and personalized ads, Meta website custom audiences, and the housing limits |

**Out of scope**

- Advanced consent mode, or loading anything before a choice (Features §4; decision D12).
- Building tags in the owner's Google or Meta accounts (owner follow-ups only).
- The dashboard's "Ads & analytics" card summary (`getTrackingSummary` in `src/lib/admin/dashboard.ts`) — it
  keeps "On after visitors agree"; the detail lives on the Ads & analytics page and the new dashboard warning.
- Automatic retries or a queue for Meta events (the Phase 6 "Known exceptions" entry stands: one try).
- Bumping the consent version (decision D11), new Cloudflare rate-limit bindings (D8), the shared admin toast
  or Save bar, and any production action.

## Architecture context (files read for this plan)

- **Consent in the browser:** `src/components/tracking/use-consent.ts` writes `cwr_consent` with
  `document.cookie` (`writeConsentCookie`), then `applyAllowedConsent` calls `keepAttribution`/`forgetAttribution`
  and `startTagManager`/`updateTagConsent`. A narrower choice runs `withdrawConsent`, which deletes tracker
  cookies (`src/lib/tracking/tracker-cookies.ts`) and reloads. `ConsentManager`
  (`src/components/tracking/consent-manager.tsx`) is mounted by `Tracking` (`src/components/tracking/tracking.tsx`)
  in the site layout, so it survives client-side page moves.
- **Cookie format:** `src/lib/tracking/consent.ts` — `cwr_consent` = URL-encoded JSON `{v, analytics, ads, at}`,
  `Path=/; Max-Age=15552000 (180 days); SameSite=Lax; Secure` on https; `CONSENT_VERSION = 1`. The server reads it
  in `src/lib/tracking/server-consent.ts` (`fetchVisitorConsent`, applying `Sec-GPC`).
- **Click IDs:** `src/lib/tracking/attribution.ts` (patterns, `getAttributionFromUrl`, `getAttributionFromField`,
  `getFbcFromAttribution`, `getLeadAttributionRow`, which already sets `fbc = _fbc ?? fbc built from fbclid`);
  `src/lib/tracking/attribution-store.ts` keeps the landing click IDs in memory, then in this tab's
  `sessionStorage` (`cwr-attribution`) once Advertising is allowed; `src/components/tracking/attribution-field.tsx`
  sends them as the hidden `attribution` field from `request-form.tsx` and `chat-handoff-form.tsx`.
- **Tag Manager:** `src/lib/tracking/data-layer.ts` — `startTagManager` pushes consent `default` (all denied,
  `wait_for_update: 500`), consent `update`, `gtm.js`, then appends the nonce'd script; `updateTagConsent` only
  pushes a consent `update`; `DEFAULT_TAG_SCRIPT_ORIGIN = "https://www.googletagmanager.com"`; `getTagScriptUrl`.
- **Leads to Meta:** `src/lib/tracking/lead-tracking.ts` — `fetchLeadTracking` (consent, `_fbc`/`_fbp`,
  attribution field), `sendMetaLead` passes `fbc: tracking.fbc` (finding 5), `scheduleMetaLead` runs it in
  `after()` and only `console.error`s a failure (finding 6). `src/lib/tracking/meta-conversions.ts` —
  `sendMetaServerEvent` (Graph API v26.0, 5-second limit, throws `MetaConversionsError {status}`). Callers:
  `src/lib/forms/submit-actions.ts` and `src/lib/chat/chat-handoff.ts` (unchanged).
- **Admin page:** `app/admin/(portal)/tracking/page.tsx` (status lines `getStatusLines`/`getMetaStatus`, quarterly
  review text), `src/components/admin/tracking/tracking-settings-form.tsx` (fields, saved-state wording),
  `src/lib/admin/tracking/actions.ts` (`saveTrackingSettingsAction` through `runAdminAction`),
  `src/lib/admin/tracking/tracking-schema.ts`.
- **Problems and background checks:** `src/lib/observability/report-problem.ts` (`reportProblem`, warnings and
  worse written before returning; never throws), `src/lib/observability/problem-catalog.ts` (mirrored in
  `cwr.problem_catalog`, compared by `npm run db:catalog`), `cwr.health_checks` + `cwr.touch_health_check`
  (`supabase/migrations/20260928000200_cwr_problem_tracking.sql`, `20261010000100_cwr_health_check_recovery.sql`;
  name list last widened in `20261012000200_cwr_email_outbox.sql`; owners read through RLS, only the service role
  may call `touch_health_check`), `src/lib/admin/health/health-notices.ts` (dashboard warnings),
  `src/lib/supabase/service-client.ts`.
- **Public endpoints:** pattern in `app/admin/problems/report/route.ts` (same-site `Origin` check via
  `isSameSiteOrigin`, rate limit, body size cap); limits in `src/lib/security/rate-limit.ts` (Workers Rate
  Limiting bindings in `wrangler.jsonc`; `isOverGuidedLimit` shows a second key prefix on an existing binding);
  `src/lib/security/visitor.ts`. `middleware.ts` runs on every path except static files; the public CSP already
  allows `connect-src 'self'`.
- **Tests:** unit tests live only under `src/**` (`vitest.config.ts`); Playwright projects in
  `playwright.config.ts` run `tests/e2e/tracking/*` alone after the rest; `tests/e2e/tracking/tracking-helpers.ts`
  intercepts every Google/Meta request in the browser. pgTAP files in `supabase/tests/database/` (latest `230`).
- **Stack (from `package.json`):** Next.js 16.3.6, React 19.3.0, `@opennextjs/cloudflare` 1.20.6,
  `@supabase/supabase-js` 2.117.2, zod 4.6.5, Vitest, Playwright 1.63.0, Node ≥ 22.

## Resolved decisions

| # | Question | Decision | Alternatives rejected, and why |
|---|---|---|---|
| D1 | How to know a container is live (finding 1) | `GET {origin}/gtm.js?id=GTM-…` from the server: 200 → published, 404 → Google can't find a published container, anything else, a network error, or 3 seconds without an answer → "couldn't check". The body is cancelled unread. Checked when saving and each time the owner opens the page, never stored | Storing the result in `tracking_settings` (that table is public-readable and the result goes stale when someone unpublishes); the Tag Manager API (needs Google sign-in and a secret); blocking the save (the owner may publish right after saving, and Google may be briefly unreachable) |
| D2 | Test seam for D1 | `TAG_MANAGER_CHECK_ORIGIN` server variable, honored only when its host is `127.0.0.1` or `localhost`; Playwright's web server sets it to `http://127.0.0.1:9` (Node's `fetch` refuses that "bad port" at once, so the answer is always "couldn't check", with no wait). Production ignores any other value | Letting tests contact Google (breaks the "tests never contact Google" rule in `tracking-helpers.ts` and makes CI depend on Google) |
| D3 | Where the browser Pixel is explained (2, 3) | Field help text, an info status line, the saved-state line for the Pixel ID, and the quarterly-review paragraph | A second Pixel ID field (the site never loads the Pixel itself; Tag Manager does) |
| D4 | Putting click IDs back in the address (4) | Only inside `startTagManager`, only when Advertising is allowed, only the four click IDs from this tab's landing page, only if missing; `history.replaceState(null, "", newAddress)` (Next.js documents native `replaceState` as router-safe and synced with `useSearchParams`). The IDs are **left in the address** | Removing them afterwards: GA4's "page changes based on browser history events" sends a page view on `replaceState`, which would double-count, and tags read the address at different times. Restoring on a later consent update: Tag Manager is already running then, so the same double page view would happen. Restoring UTM tags too: not needed for click linking, keeps the change minimal |
| D5 | Effect on analytics page address (4) | The first page view's address includes the click ID, as it would have on the landing page. That is how GA4 and Google Ads link a visit to an ad click, so it is the intended result | — |
| D6 | Meta click value (5) | `fbc: tracking.attributionRow?.fbc ?? tracking.fbc` (the row already holds `_fbc ?? fbc built from fbclid`; Meta's docs allow building `fbc` from `fbclid` with the time it was first seen, in milliseconds) | A second copy of the fallback logic (would drift from `getLeadAttributionRow`) |
| D7 | Recording Meta health (6) | Reuse `cwr.health_checks` with a new name `meta_conversions` (one migration widening the name check) and `touch_health_check` through the service role after each send. Every failure goes to the problem log as `tracking.meta_send` (origin `job`, stage `external`; HTTP 4xx → `error`, other failures → `warning`; code `http_<status>`, `timeout`, or `network`; detail only our words plus Meta's numeric error code). Only a 4xx answer (Meta refused: bad token, wrong Pixel ID, missing permission) marks the check failing, because only the owner can fix those; a timeout, network error, or Meta 5xx is logged but does not raise a page or dashboard warning that would otherwise stay up until the next lead. The page reads the row through the owner's own session; the dashboard shows "Leads can't be sent to Meta" while it is failing; no "stale" rule (leads are rare) | A new column on `tracking_settings` (public-readable); a new table (duplicates `health_checks`, more RLS to test); storing Meta's error text (could echo request data) |
| D8 | Rate limiting the new endpoint (7, 8) | Reuse the `PROBLEM_REPORT_RATE_LIMITER` binding with a separate key prefix `consent` (20 per visitor per minute), like `isOverGuidedLimit` reuses the chat binding | A new binding (needs `wrangler.jsonc` and a deploy, and account-level namespace quotas are tight — see memory note on Cloudflare quotas); the form limiter (5/min would eat into form sends) |
| D9 | Server-set consent cookie (7) | New `POST /consent` (`app/consent/route.ts`, logic in `src/lib/tracking/consent-endpoint.ts`). The browser keeps writing `cwr_consent` itself first (instant, and the fallback), then calls the endpoint. The server reads the cookie it was sent, applies `Sec-GPC`, and re-issues the **same** value with `Max-Age` = what is left of 180 days since its `at` time, so a re-issue never extends consent. Not `HttpOnly`: a script can't overwrite an `HttpOnly` cookie (RFC 6265 §5.3), so the browser fallback would silently stop working | A server action (setting a cookie in a server action re-renders the page and layout); `HttpOnly` (breaks the fallback); re-issuing on every page view (extra request per page; old Safari copies heal on their own within 7 days because the next choice goes through the server) |
| D10 | Click-ID cookie (8) | `cwr_attribution` = URL-encoded JSON of the same `Attribution` shape, `Path=/; SameSite=Lax; Secure` on https, `Max-Age` = 90 days minus the time since the ad click (`landedAt`), never `HttpOnly` so the browser can delete it without the server. Set only by the server, only when the visitor's cookie allows Advertising and `Sec-GPC` is off; deleted by the server when Advertising is off and by the browser in `forgetAttribution`. Read by the server only when Advertising is allowed and the form field is empty, through the same checks as the field. Not added to `deleteTrackerCookies`, because that also runs when only Analytics is withdrawn and the visitor still allows Advertising; `forgetAttribution` already runs on every Advertising refusal or withdrawal | `HttpOnly` (the browser could not delete it if the server call fails; the IDs give an attacker nothing useful); `localStorage` (Safari caps script storage at 7 days too) |
| D11 | Ask everyone again (`CONSENT_VERSION`)? | No. The new cookie serves the purpose visitors already agree to ("measure our ads"), and the privacy policy is updated. Tracking was off in production when last checked (runbook, 2026-10-09) | Bumping to 2 (asks returning visitors again and makes the existing GPC unit test pass for the wrong reason) |
| D12 | Consent mode (12) | Keep **basic** consent mode. Features §4 says "No tracking fires before consent where law requires it", and the Phase 6 owner decision chose "ask first" for every visitor. Google's own docs say basic mode sends nothing before consent and uses a general (not advertiser-specific) model. The runbook explains the trade-off | Advanced mode (sends cookieless pings before consent, which conflicts with Features §4 and the owner's decision) |
| D13 | Re-firing tags (9, and D12 strictness) | Push `{ event: "cwr_consent_update" }` only when a category goes from off to on while Tag Manager is already running (`updateTagConsent` compares the new choice with `runningConsent` before replacing it). Never on the first start, on re-saving the same choice, or on a narrower choice. The runbook requires additional consent on every tag (GA4's Google tag needs `analytics_storage`; ad tags need `ad_storage`), gives each the second trigger `cwr_consent_update`, and sets each to **Once per page**. So a tag never runs without its own category (no cookieless pings from GA4 for an Advertising-only visitor, keeping D12's "nothing before consent"), and never fires twice on one page | Pushing on every update or on start (re-fires the Meta PageView and Google Ads tags that already ran); pushing the choice values (tags already check consent themselves) |
| D14 | Recording the container warning | Reported where it is shown, through one helper `reportContainerStatus({ action, status })` in `container-check.ts` that calls `reportProblem({ action, stage: "external", severity, code })` directly (not `reportPageLoad`, which is for failed loads): on save `action: "tracking.save"`, on page load `action: "tracking.load"`; `not_found` → severity `warning`, code `container_not_published`; `unknown` → severity `info`, code `container_check_unreachable`; `published` → nothing. Problem groups merge repeats | Not recording (breaks the owner rule that every message shown to a user is recorded); `reportPageLoad` (always stage `load`, severity `error`, wrong for a warning) |
| D15 | Out-of-order `/consent` answers | `consent-sync.ts` runs one call at a time. It remembers the newest cookie string the browser wrote; before each call it writes that string again (so the request carries it), and after each answer it sends again if a newer choice was written meanwhile. The last answer therefore always matches the visitor's last choice | Parallel calls (a slow "accept" answer could land after a "reject" and turn Advertising back on — a consent leak) |
| D16 | Cookie size | `cwr_attribution`'s encoded value is capped at 3,800 characters (browsers drop cookies over about 4 KB without any error). If longer, the campaign tags are dropped first (click IDs matter most); if still too long, no cookie is set. The endpoint body limit is 8 KB | Trusting the size (a silent browser drop would lose the click) |
| D17 | Same ad click seen twice | Reloading an address that still holds the click ID (for example after D4) would look like a new landing. `getEarlierLanding(previous, next)` keeps the first `landedAt` when the click IDs are the same, so Meta's click time and the 90-day window don't move | Taking the newest landing time (shifts `fbc` time and extends the cookie) |
| D18 | Failures inside `/consent` | `respondToConsentRequest` catches unexpected errors at the boundary, records them with `reportVisitorProblem({ action: "site.consent", stage: "unexpected", severity: "warning", code: getErrorName(error) })`, and answers 500; a rate-limiter outage is recorded under the same action. New catalog row `site.consent` ("Save cookie choices", "Website visitors") | No catch (an unhandled error; breaks strict-code E1 and the owner's logging rule) |

## Requirements and acceptance criteria

Every check is mechanical: a named test passes, a command exits 0, or a `grep` matches. Test names are exact.

**R1 — container check (finding 1)**
- New `src/lib/admin/tracking/container-check.ts` exports `fetchContainerStatus(containerId)` →
  `"published" | "not_found" | "unknown"` and `getContainerCheckOrigin(value)`. 3000 ms limit is a named constant.
- `saveTrackingSettingsAction` (`src/lib/admin/tracking/actions.ts`) saves first, then checks; the success message
  comes from `getSavedMessage` (new, `src/lib/admin/tracking/status-lines.ts`):
  published → "Saved. Visitors now see the cookie choices." (unchanged);
  not_found → "Saved, but Google can't find a published container GTM-…. Publish it in Tag Manager (Submit, then
  Publish) or check the ID. Until then nothing is recorded.";
  unknown → "Saved. Visitors now see the cookie choices. We couldn't reach Google to check the container — see
  the status at the top of the page."; blank ID → unchanged off message.
- Page status line: published → "Tracking: on after each visitor agrees"; not_found → "Tracking: not working —
  Google can't find a published container GTM-…. Publish it in Tag Manager or check the ID."; unknown →
  "Tracking: on after each visitor agrees (we couldn't reach Google just now to confirm the container is
  published)".
- Unit tests in `src/lib/admin/tracking/container-check.test.ts`: "treats a 200 answer as a published
  container", "treats a 404 answer as a container Google can't find", "treats any other answer as unknown",
  "reports unknown when Google doesn't answer in time", "asks Google's script address with the ID encoded",
  "uses a check address only when it is on this computer", "records a warning when Google can't find the
  container", "records nothing for a published container".
- On the page, the container check and the Meta health read (R6) run together (`Promise.all`) after the settings
  read, so the page waits at most one 3-second limit extra.
- Unit tests in `src/lib/admin/tracking/status-lines.test.ts`: "says tracking is on for a published container",
  "says tracking is not working when Google can't find the container", "says the check couldn't run when Google
  is unreachable", "warns after saving a container Google can't find".
- E2E in `tests/e2e/tracking/tracking.spec.ts`: new "saving a container Google can't be reached for still saves
  and says so" (with the D2 seam: toast contains "We couldn't reach Google", status line contains "we couldn't
  reach Google just now"). The two existing admin tests still pass unchanged.
- `playwright.config.ts` `webServer.env` sets `TAG_MANAGER_CHECK_ORIGIN: "http://127.0.0.1:9"`.

**R2 — the browser Pixel is explained (finding 2)**
- `tracking-settings-form.tsx`: Pixel ID `helperText` = "This turns on the Meta server connection only. The Meta
  Pixel in visitors' browsers is added inside Tag Manager (setup guide, step 2)."
- New status line (info icon, `Info` from lucide-react, `text-muted`): "Meta Pixel in visitors' browsers: set up
  inside Tag Manager, not on this page".
- Unit test "always explains that the browser Pixel lives in Tag Manager" (`status-lines.test.ts`). E2E: the
  existing "each ID field says…" test gains one assertion that the Pixel field's accessible description contains
  "Meta server connection only".

**R3 — the two Pixel IDs must match (finding 3)**
- `IdStatusWording` (in `tracking-settings-form.tsx`) gains an optional `savedSuffix`; `getIdStatusText` appends
  it to `${savedPrefix}: ${saved}`. `PIXEL_WORDING.savedSuffix` = " — must match the Pixel ID in your Tag Manager
  Meta Pixel tag", so the saved line reads "Saved: {id} — must match the Pixel ID in your Tag Manager Meta Pixel
  tag". The container wording is unchanged.
- Quarterly review paragraph in `page.tsx`: "Every 3 months, open Tag Manager, remove any tag you no longer use,
  and check that the Meta Pixel tag uses the same Pixel ID as below."
- Runbook §8 lists the Pixel ID match. Checks: `grep -c "must match the Pixel ID" src/components/admin/tracking/tracking-settings-form.tsx` = 1;
  `grep -c "same Pixel ID" docs/runbooks/ads-analytics-setup.md` ≥ 1; the `Off — nothing saved` e2e assertion for
  the Pixel field still passes.

**R4 — click IDs back in the address (finding 4)**
- `src/lib/tracking/attribution.ts` exports pure `getAddressWithClickIds({ href, attribution })` → new address
  string, or `null` when nothing is missing. Only `gclid`, `gbraid`, `wbraid`, `fbclid`; other parameters and the
  `#` part are kept in order.
- `attribution-store.ts` exports `restoreClickIdsInAddress()` (browser): calls the pure function with the
  in-memory landing attribution and, when it returns an address, `window.history.replaceState(null, "", address)`.
- `use-consent.ts` `applyAllowedConsent`: when Tag Manager is **not** yet running, it calls
  `startTagManager({ …, beforeStart: allowed.ads ? restoreClickIdsInAddress : undefined })`.
- Unit tests in `attribution.test.ts`: "adds the landing click IDs back to an address that lost them", "leaves an
  address that already has its click IDs unchanged", "brings back no campaign tags", "keeps every other
  parameter and the page anchor".
- Order check: `startTagManager` gains an optional `beforeStart` callback that it runs before its first
  data-layer push and before the script is added. Unit test in `data-layer.test.ts`: "runs the address restore
  before the Tag Manager script is added" (the spy's call order is before `document.head.append`).
- E2E "click IDs are back in the address before Tag Manager starts after moving to another page": land on
  `/?gclid=…`, follow a header link with a client-side move, check the address has no `gclid`, press Accept all,
  then the address contains the `gclid` and the data layer holds `gtm.js`. Plus "rejecting keeps click IDs out of
  the address": same start, Reject all, address has no `gclid`.

**R5 — Meta click value fallback (finding 5)**
- `sendMetaLead` passes `fbc: tracking.attributionRow?.fbc ?? tracking.fbc`.
- Unit test in `lead-tracking.test.ts`: "sends Meta the click value built from the ad link when the Pixel set no
  click cookie" (mock `fetch`, `fetchTrackingSettings`, run the `after` callback; the sent body's
  `user_data.fbc` = `fb.1.{landedAt}.{fbclid}`).

**R6 — Meta failures are recorded and shown (finding 6)**
- Migration `supabase/migrations/20261021000100_cwr_meta_send_health.sql`: widen `health_checks_name_check` to
  add `meta_conversions` (drop, add `not valid`, validate — the pattern in `20261012000200`); insert catalog rows
  `('tracking.meta_send', 'tracking', 'Send a lead to Meta', 'Ads & analytics', '{}')` and
  `('site.consent', 'site', 'Save cookie choices', 'Website visitors', '{}')`. Nothing else.
- `problem-catalog.ts` gains `"tracking.meta_send": { label: "Send a lead to Meta" }` and
  `"site.consent": { label: "Save cookie choices" }`.
- `meta-conversions.ts`: `MetaConversionsError` context gains `metaErrorCode: number | null`, read from Meta's
  JSON `error.code` when it is a number (body read capped at 4 KB; anything else → null).
- New `src/lib/tracking/meta-health.ts` (server-only): `recordMetaSendSuccess()` and
  `recordMetaSendFailure(error)` — `touch_health_check` with `p_name: "meta_conversions"` through
  `createServiceClient` (skipped when service access is not configured); every failure goes to `reportProblem`,
  and only a `MetaConversionsError` with a 4xx status marks the check failing (D7).
  Errors from the health write are caught with a comment (the lead is already saved; the problem log line is the
  record). `scheduleMetaLead` calls them; the skip cases (no token, no Pixel ID, no page address) record nothing.
- `health-notices.ts`: `HealthCheckName` gains `meta_conversions`; it joins `FAILING_CHECK_NAMES`;
  `FAILING_TITLES.meta_conversions = "Leads can't be sent to Meta"`; no stale rule.
- Page: reads `health_checks` (`name, last_ok_at, last_error, last_error_at`) for `meta_conversions` through the
  owner's session; `getMetaStatus` (moved to `status-lines.ts`) returns: no Pixel / no token lines unchanged;
  never sent → "Meta server connection: on — no lead sent to Meta yet"; healthy → "Meta server connection: on —
  last lead sent to Meta {Oct 21, 3:04 PM}"; failing → "Meta server connection: not working — the last lead
  couldn't be sent on {date} ({error}). Check the access token and the Pixel ID." (+ " Last success: {date}." when
  there is one). Load failures are covered under "Load order and failures" below. Dates use `America/New_York`.
- Tests: pgTAP `supabase/tests/database/240-meta-send-health.test.sql`, `plan(6)`: "The Meta check records a
  success", "The Meta check records a failure", "Unknown check names are still refused" (23514), "Owners can read
  the Meta check", "Managers can't read the Meta check" (zero rows), "Visitors can't read background checks"
  (42501). Unit: `lead-tracking.test.ts` "records a problem and marks the Meta check failing when Meta refuses
  the event", "marks the Meta check healthy after Meta accepts the event", "logs a Meta timeout without marking
the check failing"; `meta-conversions.test.ts` "keeps
  Meta's numeric error code with a refused event"; `health-notices.test.ts` "warns while leads can't be sent to
  Meta" and "never calls the Meta check stale"; `status-lines.test.ts` "shows when the last lead reached Meta",
  "says the Meta connection is not working after a failure", "says no lead has been sent to Meta yet", "mentions
  a passing failure newer than the last success".
- Passing failures are visible too: the page also reads the newest `problem_events` row for
  `action = 'tracking.meta_send'` (owners can read problem events through RLS; `.order("occurred_at", desc).limit(1)`).
  It joins the same `Promise.all` as the container check and the health read, and is passed to
  `reportPageLoad` with them. When it is newer than `last_ok_at` and the check isn't failing, the Meta line adds
  " A try on {date} didn't get through (Meta was busy or didn't answer); later leads try again." It names one past
  try, never "the last", because a success within a minute of an earlier one is not stamped (the at-most-once-a-minute
  rule in `touch_health_check`), and grouped repeats may not each be stored. Unit test: "words the
  passing-failure note as one past try, not the latest". No dashboard warning for this
  case.
- Load order and failures: the page reads the settings first, as today; if that fails it shows the existing
  `LoadProblem` and fetches nothing else. Otherwise the container check, the health read, and the problem read
  run together, then one `reportPageLoad` call covers all reads. If the health or problem read failed, the Meta
  line reads "Meta server connection: this part didn't load (reference {CWR-…})", the same words
  `reportPageLoad` records, and the form still shows. Unit test: "shows that the Meta status didn't load, with
  its reference".
- `sendMetaLead` returns `"sent" | "skipped"` (a named type), so `scheduleMetaLead` records success only for
  `"sent"` and records nothing for a skip.
- `npm run db:catalog` prints 125 actions (`tracking.meta_send` and `site.consent`, R7).

**R7 — server-set consent cookie (finding 7)**
- `consent.ts` exports `getConsentReissue({ cookieValue, isGpcOn, now })` → `{ cookieString } | null`: same JSON,
  `ads` turned off under GPC, original `at` kept, `Max-Age` = remaining seconds (0 < remaining ≤ 180 days),
  `null` for a missing, old-version, undated, or expired cookie. An `at` up to 24 hours in the future (a device
  clock running fast) counts as now, so remaining time is never above 180 days; further in the future → `null`.
- `consent-endpoint.ts` exports `respondToConsentRequest(request)`; `app/consent/route.ts` is
  `export function POST(request: Request) { return respondToConsentRequest(request); }`. Order: same-site `Origin`
  (403) → rate limit `isOverConsentLimit` in `rate-limit.ts` (429; limiter outage recorded as `site.consent`) →
  body ≤ 8 KB JSON `{ attribution?: string }` (400) → re-issue (`Set-Cookie`) → click-ID cookie (R8) → `204`,
  `Cache-Control: no-store`. Unexpected errors: caught, recorded, 500 (D18).
- New browser module `src/lib/tracking/consent-sync.ts`: `sendConsentToServer({ cookieString })` —
  `cookieString` is optional. When given (a new choice), it becomes the newest choice string; when left out (the
  page-load call), nothing is rewritten, so the 180-day clock never restarts. It returns a promise that settles
  when the newest state has been sent (D15: one call at a time; before each call rewrite the newest choice string,
  if there is one, with `document.cookie`; send again if a newer choice was written during the call). Each call
  posts `{ attribution: getStoredAttribution() }` with `credentials: "same-origin"`; the whole loop has one
  3-second deadline (`AbortSignal.timeout`), not 3 seconds per call; a failure ends the loop and is caught with a
  comment (the browser's own cookie is the fallback the requirement names). All cookies the endpoint sets are
  host-only (no `Domain`) with `Path=/`, the same as the browser's copies, so they replace them rather than sit
  beside them.
- `use-consent.ts`: `saveChoice` is the only caller on a choice, and calls once. Wider or equal choice: write the
  cookie, `applyAllowedConsent`, then `sendConsentToServer({ cookieString })` (not awaited). Narrower choice:
  write the cookie, then `withdrawConsent`, moved to a new browser module `src/lib/tracking/consent-withdrawal.ts`
  so its order is unit-tested. Its order: (1) `updateTagConsent` with only what both the old and the new choice
  allow (`{ analytics: previous.analytics && next.analytics, ads: previous.ads && next.ads }`), so running tags
  stop writing cookies at once and no category is newly allowed, so no `cwr_consent_update` is sent (a choice
  that turns one category off and another on is narrower and still reloads; the newly allowed category starts
  after the reload); (2) `forgetAttribution()` if Advertising is off;
  (3) **await** `sendConsentToServer({ cookieString })` (3-second deadline); (4) `deleteTrackerCookies()`; (5)
  reload. Deleting after the wait means nothing a tag wrote during the wait survives. `saveChoice` makes no
  second call on that path.
  Repeated clicks during the wait only update the newest string (D15). The page-load effect calls
  `sendConsentToServer` only when `keepAttribution()` returns `true` (a returning visitor arriving from a new
  ad); otherwise a page load makes no call.
- Unit tests `consent.test.ts`: "re-issues the saved choice for what is left of its 180 days", "turns off
  Advertising when re-issuing under Global Privacy Control", "re-issues nothing for a missing, older, undated, or
  expired choice". `src/lib/tracking/consent-endpoint.test.ts`: "refuses calls from other sites", "refuses calls
  over the limit", "refuses a body that is too large or not JSON", "re-issues the consent cookie from the
  server", "sets no consent cookie and expires the click cookie when the visitor has not chosen", "records an unexpected failure and answers
  500". `src/lib/tracking/consent-sync.test.ts` (with a stubbed `document` and `fetch`): "sends the newest choice
  last when the choice changes during a call", "makes one call for one choice", "keeps the browser's own cookie
  when the call fails", "a page-load call never rewrites the consent cookie", "stops waiting after 3 seconds in
  total". `src/lib/tracking/consent-withdrawal.test.ts` (stubbed `window`, `document`, `dataLayer`): "tells running
  tags about the narrower choice before waiting, then deletes tracker cookies just before reloading".
  `consent.test.ts` also: "treats a choice dated a little in the future as made now". E2E "no consent call on a
  page load without new click IDs": a returning visitor with a
  saved choice opens two pages; no request to `/consent` is made.
- E2E "the server re-issues the consent cookie after a choice": wait for the `POST /consent` response after
  Accept all; `response.headerValue("set-cookie")` (Playwright leaves `set-cookie` out of `headers()`) contains `cwr_consent=` and a `Max-Age` between 15551000 and 15552000; and
  "if the server can't be reached the choice still works": route `/consent` to abort, Reject all, reload, banner
  gone, cookie `{analytics:false, ads:false}`.

**R8 — click IDs across tabs (finding 8)**
- `attribution.ts` exports `getEarlierLanding(previous, next)` (D17), `isSameAttribution(a, b)`, and `ATTRIBUTION_COOKIE = "cwr_attribution"`, `getAttributionCookieString({ attribution,
  now, isSecure })` (`Max-Age` = 90 days − (now − landedAt), never above 90 days; `null` when ≤ 0) and
  `getAttributionFromCookie(value)` (decode, then the same checks as `getAttributionFromField`).
- `consent-endpoint.ts`: when the re-issued choice allows Advertising and the body's `attribution` passes
  `getAttributionFromField`, set `cwr_attribution` (size rule D16); when Advertising is off (or GPC is on, or no
  choice), set it expired. A body without attribution, or with `attribution: ""`, leaves an existing click cookie
  alone. When an existing `cwr_attribution` cookie has the same click IDs, the endpoint keeps its earlier
  `landedAt` (`getEarlierLanding`, D17), so a new tab on a restored address never pushes the 90-day window later.
- `attribution-store.ts` `rememberLandingAttribution` applies `getEarlierLanding` against the `cwr-attribution`
  value already in this tab's `sessionStorage` before keeping the new landing.
- `attribution-store.ts` `keepAttribution` returns `true` only when the value in `sessionStorage` changed (a
  reload of an address that still holds the same click returns `false`, thanks to D17); it makes no network call
  itself. `applyAllowedConsent` in `use-consent.ts` returns that boolean (`false` when Advertising is off), so the
  page-load effect can decide whether to call the endpoint (R7). The pure comparison `isSameAttribution(a, b)` in
  `attribution.ts` (step 5) has the unit test "treats the same ad click as already stored"; a failed storage
  write also returns `false`, so blocked storage never causes a call; `forgetAttribution` also deletes `cwr_attribution` with
  `document.cookie` (`Max-Age=0; Path=/`).
- `lead-tracking.ts` `fetchLeadTracking`: `attribution = fromField ?? fromCookie` (cookie read only on the
  Advertising-allowed path).
- Privacy policy (`app/(site)/privacy-policy/page.tsx`), Advertising list: "If you arrived from one of our ads,
  we keep the ad's click code and campaign name with your message (&ldquo;cwr-attribution&rdquo; session storage,
  and the &ldquo;cwr_attribution&rdquo; cookie for up to 90 days after the ad click)." `tests/e2e/privacy.spec.ts`
  first test adds `"cwr_attribution"` to its list.
- Unit tests `attribution.test.ts`: "reads back the click cookie it wrote", "drops a forged or broken click
  cookie", "keeps the first landing time for the same ad click", "lasts until 90 days after the ad click", "is not written for an ad click older than 90 days", "drops
  campaign tags to stay under the cookie size limit", "writes no cookie when even the click IDs are too long";
  `consent-endpoint.test.ts`: "keeps click IDs in a cookie only when Advertising is allowed", "deletes the click
  cookie when Advertising is off", "deletes the click cookie under Global Privacy Control";
  `lead-tracking.test.ts`: "uses the click cookie when the form's hidden field is empty", "prefers the form's
  hidden field over the click cookie", "ignores the click cookie when Advertising is not allowed".
- E2E "a lead sent from a new tab keeps the ad click": land on `/contact?gclid=…`, Accept all, wait for
  `POST /consent`, open a new page in the same context at `/contact`, send the form, `fetchLeadAttribution` has
  the `gclid`. "withdrawing Advertising deletes the click cookie": then turn Advertising off in Cookie settings;
  after reload no `cwr_attribution` cookie. The existing "a lead who rejected cookies carries no ad click IDs"
  test still passes and also asserts no `cwr_attribution` cookie.

**R9 — consent update event (finding 9)**
- `data-layer.ts` `updateTagConsent` pushes `{ event: "cwr_consent_update" }` right after the consent update,
  only when a category that was off in `runningConsent` is on in the new choice (D13; exported constant
  `CONSENT_UPDATE_EVENT`).
- Unit tests `data-layer.test.ts`: "tells running tags when Advertising is newly allowed with a
  cwr_consent_update event", "tells running tags when Analytics is newly allowed with a cwr_consent_update
  event", "sends no cwr_consent_update when Tag Manager first starts", "sends no cwr_consent_update when the same
  choice is saved again", "sends no cwr_consent_update for a narrower choice"; and in `consent-withdrawal.test.ts`: "sends no
  cwr_consent_update when a choice turns one category off and another on". E2E "allowing Advertising after Analytics sends
  cwr_consent_update": save Analytics only, then Advertising too; the data layer holds the event once.
- Runbook §2 says to add a Custom Event trigger `cwr_consent_update` as a second trigger on the GA4 Google tag,
  the Meta Pixel base tag, the Conversion Linker, and the Google tag with the `AW-` ID; to set each of those tags'
  Advanced settings → Tag firing options to **Once per page**; and, on the GA4 Google tag, consent settings →
  **Require additional consent → `analytics_storage`** (replacing today's "add nothing else"). Check also `grep -c "Once per page" docs/runbooks/ads-analytics-setup.md` ≥ 1. Check: `grep -c "cwr_consent_update" docs/runbooks/ads-analytics-setup.md` ≥ 3.

**R10 — Conversion Linker and Google Ads Google tag (finding 10)** — runbook §2 gains steps "Conversion Linker"
(trigger Initialization – All Pages plus `cwr_consent_update`; require `ad_storage`) and "Google tag with your
Google Ads ID (`AW-…`)" (same triggers and consent). Check: `grep -c "Conversion Linker" docs/runbooks/ads-analytics-setup.md` ≥ 2 and `grep -c "AW-" …` ≥ 1.

**R11 — enhanced conversions and customer data terms (finding 11)** — runbook §6 gains: Google Ads → Goals →
Settings → **Customer data use** → "Turn on enhanced conversions" → Agree and save → review the data terms →
Agree and continue, before the first closed-deal upload (Google combined the web and leads settings in June
2026). Check: `grep -c "Customer data use" docs/runbooks/ads-analytics-setup.md` ≥ 1, and §7 refers to it.

**R12 — basic consent mode trade-off (finding 12)** — no code change. Runbook "Why the numbers look lower" adds:
the site uses Google's basic consent mode on purpose (Features §4); people who leave before choosing or press
Reject aren't counted at all; Google models the missing conversions from a general model, not one built for
this site; the inbox still gets every lead. Check: `grep -c "basic consent mode" docs/runbooks/ads-analytics-setup.md` ≥ 1.

**R13 — retargeting (audit note)** — runbook new §10 "Optional: show ads again to past visitors": GA4 Admin →
Product links → Google Ads links (link, turn on personalized advertising); GA4 Admin → Data collection → Google
signals (optional; mention it adds Google's own signed-in data); Google Ads audience from GA4 visitors; Meta
Events Manager → Custom audience → Website (Pixel visitors); housing rules: never build or narrow an audience by
age, gender, ZIP code, parental or marital status; Meta lookalike audiences are not available for housing; only
advertising-consenting visitors are in these lists. Check: `grep -c "Housing" docs/runbooks/ads-analytics-setup.md` ≥ 2.

**Cross-cutting**
- `README.md` Configuration line names `TAG_MANAGER_CHECK_ORIGIN` as test-only (one line).
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run errors:check`, `npm run design:check`,
  `npm run db:check`, `npm run db:catalog`, `npm run db:test`, `npm run db:lint`, and the tracking + privacy e2e
  runs all exit 0 at the end.

## Task breakdown (small, independently committable steps)

Each step ends green on `npm run lint && npm run typecheck && npm test` plus the step's own check, and is one
commit (message ends with the attribution line from the session). Order and dependencies: 1 and 2 have none;
3 needs 2 (`status-lines.ts`); 4 needs 1 (the `meta_conversions` name) and 3 (the `StatusLine` `kind` field); 5 needs 4 (both edit
`lead-tracking.ts`); 6 needs 1 (`site.consent`) and 5 (cookie helpers); 7 needs 6 (the endpoint) and 9 (its withdrawal test checks
`CONSENT_UPDATE_EVENT`); 8 needs 7 (same browser files); 9 has none (only `data-layer.ts`) and runs before 7; 10 needs 1–9; 11 is last.

0. **Baseline.** Run the Verification commands below on the untouched branch (the planner's results are in
   Regression safeguards; add the database and browser runs). Keep the output in the session's scratchpad for the
   completion report, not in the repository. Stop if any is red (stop rule).
1. **Migration and catalog (R6, database part).** Files: `supabase/migrations/20261021000100_cwr_meta_send_health.sql`,
   `supabase/tests/database/240-meta-send-health.test.sql`, `src/lib/observability/problem-catalog.ts`. Apply
   locally (`npx supabase migration up --local`). Check: `npm run db:check`, `npm run db:test` (all files pass),
   `npm run db:lint`, `npm run db:catalog` (125 actions).
2. **Container check (R1).** Files: new `src/lib/admin/tracking/container-check.ts` (+ test), new
   `src/lib/admin/tracking/status-lines.ts` (+ test; move `getStatusLines`/`getMetaStatus` here unchanged first,
   then add the container states), `src/lib/admin/tracking/actions.ts`, `app/admin/(portal)/tracking/page.tsx`,
   `playwright.config.ts` (`webServer.env`), `README.md` (one line). Check: R1 unit tests, `npm run errors:check`.
3. **Pixel wording (R2, R3).** Files: `tracking-settings-form.tsx`, `status-lines.ts` (+ test),
   `page.tsx` (review paragraph; `StatusLine` gains `kind: "ready" | "attention" | "info"` with `Info` icon).
   Check: R2/R3 unit tests, `npm run design:check`.
4. **Meta fallback and Meta health (R5, R6 code part).** Files: `src/lib/tracking/lead-tracking.ts`,
   `src/lib/tracking/meta-conversions.ts`, new `src/lib/tracking/meta-health.ts`,
   `src/lib/admin/health/health-notices.ts`, their tests, `status-lines.ts`, `page.tsx` (health read). Needs step 1
   for the local database. Check: R5/R6 unit tests, `npm run errors:check`, `npm run db:catalog`.
5. **Click-ID cookie helpers and server fallback (R8, server part).** Files: `src/lib/tracking/attribution.ts`
   (+ test), `src/lib/tracking/lead-tracking.ts` (+ test). Check: R8 unit tests for `attribution.test.ts` and
   `lead-tracking.test.ts`.
6. **Consent endpoint (R7, R8 endpoint part).** Files: `src/lib/tracking/consent.ts` (+ test), new
   `src/lib/tracking/consent-endpoint.ts` (+ test), new `app/consent/route.ts`, `src/lib/security/rate-limit.ts`
   (`isOverConsentLimit`). Check: R7/R8 endpoint unit tests (`npm test -- consent`), `npm run db:catalog`.
7. **Browser wiring (R7, R8 client part).** Files: new `src/lib/tracking/consent-sync.ts` (+ test), new
   `src/lib/tracking/consent-withdrawal.ts` (+ test, including "sends no cwr_consent_update when a choice turns
   one category off and another on"),
   `src/lib/tracking/attribution-store.ts`, `src/components/tracking/use-consent.ts`,
   `app/(site)/privacy-policy/page.tsx`, `tests/e2e/privacy.spec.ts`, `tests/e2e/tracking/tracking.spec.ts`
   (R7/R8 e2e). Check: `npx playwright test tests/e2e/tracking tests/e2e/privacy.spec.ts`.
8. **Click IDs back in the address (R4).** Files: `attribution.ts` (+ test), `attribution-store.ts`,
   `use-consent.ts`, `data-layer.ts` (`beforeStart` option, + test), `tracking.spec.ts` (R4 e2e). Check: R4 unit
   + e2e tests.
9. **Consent update event (R9).** Files: `src/lib/tracking/data-layer.ts` (+ test), `tracking.spec.ts`
   (R9 e2e). Check: the R9 tests in `data-layer.test.ts` and the R9 e2e (the `consent-withdrawal.test.ts` R9 test
   belongs to step 7). Run it before step 7; step 8 then builds its `data-layer.ts` edit on this one.
10. **Runbook and docs (R3, R9–R13).** Files: `docs/runbooks/ads-analytics-setup.md`; one line in
    `docs/cwr-phase-6-analytics-consent-plan.md` "Known exceptions"/decision 12 pointing here (click IDs now also
    in a 90-day cookie). Check: every `grep` in R3 and R9–R13; event names in the runbook match `KeyEventName` and
    `CONSENT_UPDATE_EVENT` (`grep -o "cwr_[a-z_]*" docs/runbooks/ads-analytics-setup.md | sort -u` ⊆ names in
    `data-layer.ts`).
11. **Full verification, then independent review.** All Verification commands; reset the local database and
    import real content afterwards (`npx supabase db reset --local` then `npm run content:import:local`, per the
    owner's standing rule); a review subagent checks the build against this plan.

## Edge cases (three levels deep, most → least critical)

| # | What could go wrong (level 1 → 2 → 3) | Solution |
|---|---|---|
| 1 | The endpoint sets the click cookie for someone who said no. Their ad click then reaches a lead record. That breaks "nothing tracks before consent" and the privacy policy. | The server only sets it when the cookie it received allows Advertising and `Sec-GPC` is off. A refusal makes the server expire it and the browser delete it. Unit and e2e tests cover Reject, GPC, and withdrawal. |
| 2 | A forged click cookie carries huge or strange values. The server reads it into a lead. Bad data could reach the database or the export files. | The cookie goes through the same strict checks as the form field. Anything odd is dropped and the lead still saves. The database's own check rules are the last guard. |
| 3 | Another website posts to `/consent` in a visitor's browser. It could re-issue or delete their cookies. It cannot grant consent, but it could wipe a click cookie. | The endpoint refuses any call whose `Origin` isn't this site (OWASP). It never reads a choice from the body, only from the visitor's own cookie. Rate limits stop floods. |
| 4 | A visitor accepts, then quickly turns Advertising off. The slow "accept" answer arrives last. The server would switch Advertising back on and keep their click. | Calls go one at a time, and the newest choice is always sent last (D15). The browser rewrites the newest choice before each call. A unit test changes the choice during a call. |
| 5 | A visitor withdraws consent, and the page waits up to 3 seconds for the server before reloading. Tags still running with consent on write new tracking cookies. Those cookies survive the reload. | Running tags are told "denied" before the wait starts. Tracker cookies are deleted after the wait, just before the reload. A unit test checks this order. |
| 6 | Withdrawal reloads the page before the server call ends. The server copy keeps the old choice. The next page could restart tags. | The browser writes the new choice first, and the cookie a request sends is the newest copy. The reload waits for the call (3 seconds at most in total). The click cookie is also deleted by the browser itself. |
| 7 | A page-load call rewrites the consent cookie with a fresh date. The 180-day clock restarts. People are never asked again. | The page-load call sends only click IDs and rewrites nothing. Only a real choice writes the cookie. A unit test checks the page-load call leaves the cookie alone. |
| 8 | A re-issue could reset the 180-day clock. Consent would never expire. The site would stop re-asking people as the policy promises. | The server keeps the original date and sets only the time that is left. Undated or expired cookies are not re-issued. Unit tests check the remaining time. |
| 9 | Restoring `gclid` into the address happens after Tag Manager has started. GA4 would see a history change. A second page view would double-count visits. | Restoring runs only inside the first start, before the script is added. Later consent updates never touch the address. A unit test checks the order. |
| 10 | Restoring the address confuses the Next.js router. A page that reads the address could re-render. A filter page could reset what the visitor picked. | Native `replaceState` is supported by Next.js and only adds missing click IDs. Other parameters and the anchor stay exactly as they were. The e2e test moves between pages after the restore. |
| 11 | Google is slow when the owner saves. The save would wait. A long wait could look like a crash and lose typed text. | The check stops after 3 seconds and says "couldn't check". The ID is saved first, so a slow Google never blocks it. A unit test covers the time limit. |
| 12 | Google says 404 because the owner hasn't published yet. Visitors still see a banner. They agree, but nothing is recorded. | The save message and the status line say so plainly and how to fix it. The runbook says to publish before pasting the ID. The warning goes away by itself once Google finds it. |
| 13 | The check address could be pointed somewhere else. The server would call an unknown host. That could leak or be abused. | The address is fixed to Google. The test override works only for `127.0.0.1` or `localhost`, and the ID passes a strict pattern and is encoded. |
| 14 | The Meta token expires. Every lead fails to reach Meta. The page would still say "on" and ad results would quietly drop. | Each failure is recorded as a problem with Meta's error number. The page says "not working" with the date. The dashboard shows a warning until a send works again. |
| 15 | Recording Meta health fails too (database down). The failure leaves no trace. The owner never learns about it. | The problem recorder always writes a server log line first. A failed health write is caught and noted in the log. The lead itself is never affected. |
| 16 | Many leads fail at once. The problem log fills with copies. Alert emails could flood once they are switched on. | Problems with the same code join one group and count up. The health check keeps one row, and success is stamped at most once a minute. |
| 17 | A brief Meta outage fails one lead. A warning would stay up for weeks until the next lead. The owner would chase a problem that fixed itself. | Only Meta refusing the event (a 4xx answer) marks the connection "not working" (D7). Timeouts and Meta outages are still logged, and the page notes a recent passing failure. A unit test checks a timeout leaves the check healthy. |
| 18 | A lead to Meta times out, and the next one works a few seconds later. The success isn't stamped (once a minute). The page could claim the latest send failed. | The note says "a try on {date} didn't get through", never "the last try". The dashboard warns only for Meta refusals. A unit test checks the wording. |
| 19 | The server call for the consent cookie fails. The server copy is never set. Safari then forgets the choice in 7 days (24 hours on a page reached from an ad link). | The browser's own copy is written first, so the choice works right away. The visitor is simply asked again later, which is safe. An e2e test blocks the call and checks the choice still holds. |
| 20 | A phone's clock runs a few minutes fast. The cookie's date looks like the future. The server refuses to re-issue it and Safari's cap comes back. | Dates up to 24 hours ahead count as now. The remaining time is still never above 180 days. A unit test covers a fast clock. |
| 21 | The click cookie outlives the 90-day Google limit. Old clicks get sent. Google rejects them and the export looks broken. | The cookie's life ends 90 days after the ad click, not after the visit. Older clicks are never written. The closed-deals page already explains the limits. |
| 22 | The owner adds `cwr_consent_update` and also keeps "All Pages" on a tag. The tag fires twice on one page. Ad counts double. | The event is sent only when a category (Analytics or Advertising) is newly allowed while Tag Manager is running, never on first start or a re-save. The runbook sets those tags to fire once per page. Unit tests cover start, re-save, and narrower choices. |
| 23 | Many campaign tags make the click cookie too big. The browser drops it without a word. The ad click is lost in other tabs. | The server caps the size and drops campaign tags first. Click IDs are kept whenever they fit. Unit tests check both size cases. |
| 24 | A reload keeps the restored click ID in the address. The site thinks it is a new ad click. Meta's click time and the 90-day window move later. | The first landing time is kept when the click IDs match (D17). A unit test covers it. The cookie's end date never moves later. |
| 25 | The admin Pixel ID differs from Tag Manager's. Browser and server events land in two places. Meta can't match them and counts split. | The saved-ID line says it must match. The quarterly review and runbook §8 check it. Meta's Events Manager shows two sources if it ever drifts. |
| 26 | Test runs call Google from the server. CI depends on Google. A Google hiccup fails the build. | Playwright points the check at a closed local port. Unit tests fake Google's answers. No test contacts Google. |
| 27 | A local dev server already runs on port 3100. Playwright reuses it without the test setting. Admin tests contact Google. | The runbook-style note in Verification says to stop any server on 3100 first. CI never reuses a server. |
| 28 | Cookie storage is blocked (private window). The endpoint's cookies can't be stored. Click IDs aren't kept. | Same as today: the page still works and nothing extra is tracked. A failed storage write counts as "nothing new", so no call is made on each page. |

## Assumptions

- Production tracking is still off (runbook check 2026-10-09; owner memory). The plan does not depend on it: if a
  container were live, returning visitors keep their choice (no version bump) and nothing breaks.
- The site and `/consent` are served from the same host and IP (one Cloudflare Worker), so Safari treats the
  re-issued cookie as first-party (WebKit caps cookies from "third-party IP" responses only).
- Google still answers 404 for a missing or unpublished container (Analytics Mania and Complianz troubleshooting
  guides, 2026). If Google ever changes this, the page shows "couldn't check", never a false "not working".
- Meta's error body still carries a numeric `error.code` (190 = invalid token). If not, the code is null and the
  HTTP status is still recorded.
- The local Supabase stack (Docker) is running for database tests; it was running on 2026-10-21.

## DO NOT TOUCH

- `docs/constitution/*`; the chat assistant and policy files (`answer-question.ts`, `assistant-*`, policy text);
  `wrangler.jsonc`; `middleware.ts`; `src/lib/security/content-security-policy.ts`; every migration already in
  `supabase/migrations/` (immutable); pgTAP files `000`–`230`; `save-bar.tsx`, `use-admin-form`, the shared toast;
  `src/lib/tracking/hashing.ts`, `offline-export.ts`, `tag-server.ts`, `tracker-cookies.ts`;
  `src/components/tracking/cookie-banner.tsx`, `cookie-settings-dialog.tsx`, `cookie-settings-link.tsx`;
  `submit-actions.ts`, `chat-handoff.ts`, `intake.ts`; `src/lib/admin/dashboard.ts`; the production database,
  Cloudflare settings, and GitHub (no push, no PR, no merge).

## Regression safeguards

**Protected behaviors (including relied-upon behavior nobody wrote down)**
1. Nothing loads, and no `/consent` call is made, before a choice; Reject keeps every tracker off.
2. Accept all: consent defaults "denied", then update, then `gtm.js` with the nonce — in that exact data-layer
   order (the e2e test reads entries 0 and 1 of the data layer, so no new entry may come before them).
3. GPC locks Advertising off in the browser and on the server.
4. Withdrawal deletes `_ga*`, `_gcl*`, `_fbp`, `_fbc`, `FPLC` and reloads.
5. A lead saves even if attribution, Meta, or the new health write fails; Meta is sent once, after the reply.
6. The `cwr_consent` cookie name, JSON shape, `v: 1`, 180-day life, `SameSite=Lax`, `Secure` on https.
7. Without a container ID: no banner, no scripts, "Cookie settings" opens the privacy policy, and `/consent` is
   never called (the consent manager isn't mounted).
8. Ads & analytics is owner-only; a wrong ID shows the field error; saved-state lines read "Live on the website",
   "Not saved yet — …", "Off — nothing saved"; the toast "Saved. Visitors now see the cookie choices." still
   appears for a published (or unchecked) container.
9. Dashboard health warnings for the existing checks are unchanged.
10. Problem catalog and database catalog stay identical.

**Existing tests and commands that cover them:** `src/lib/tracking/*.test.ts`, `src/lib/admin/tracking/tracking-admin.test.ts`,
`src/lib/admin/health/health-notices.test.ts` (`npm test`); `tests/e2e/tracking/tracking.spec.ts` (15 tests) and
`tests/e2e/privacy.spec.ts` (3 tests) (`npx playwright test tests/e2e/tracking tests/e2e/privacy.spec.ts`);
`supabase/tests/database/120-tracking.test.sql`, `150-problem-tracking.test.sql`, `220-health-check-recovery.test.sql`
(`npm run db:test`); `npm run db:catalog`, `npm run errors:check`.

**Baseline (run by the planner on 2026-10-21, branch at `0f24000`, no changes):**

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0 — 115 files, 1114 passed, 2 skipped |
| `npm run errors:check` | exit 0 — "Error-handling check passed." |
| `npm run design:check` | exit 0 — "Design token check passed." |
| `npm run db:check` | exit 0 — "Migration check passed." |
| `npm run db:catalog` | exit 0 — "Problem-catalog check passed (123 actions)." |
| `npm run db:test`, `npm run db:lint`, tracking + privacy e2e | not run by the planner (they reset or load the shared local database); the implementer records them in step 0 |

**Gap tests written before the change they protect:** the e2e "if the server can't be reached the choice still
works" (behavior 6 with the new endpoint) and the unit "sends no cwr_consent_update when Tag Manager first
starts" (behavior 2) are written and passing at the start of steps 7 and 9, before their code changes (the first
passes today because there is no endpoint; the second because there is no event).

**Stop rule:** any test that passed in the baseline and fails afterwards is a regression. Work stops until it is
fixed or the owner explicitly accepts it.

## Downstream impact analysis

### Level 1 — Direct
Files: listed per step above (new: `container-check.ts`, `status-lines.ts`, `meta-health.ts`, `consent-endpoint.ts`,
`consent-sync.ts`, `app/consent/route.ts`, migration `20261021000100`, pgTAP `240`, their tests; changed:
`actions.ts`, `page.tsx`, `tracking-settings-form.tsx`, `lead-tracking.ts`, `meta-conversions.ts`,
`attribution.ts`, `attribution-store.ts`, `consent.ts`, `data-layer.ts`, `use-consent.ts`, `rate-limit.ts`,
`health-notices.ts`, `problem-catalog.ts`, privacy policy page, `playwright.config.ts`, `README.md`, runbook, two
e2e specs).
Also `consent-sync.ts`, `consent-withdrawal.ts` (+ tests) and the `site.consent` catalog row.
Contracts: `cwr.health_checks.name` allowed values; `startTagManager` options (`beforeStart`); `MetaConversionsError.context`; `HealthCheckName`;
`StatusLine` type (moves to `status-lines.ts`); new public `POST /consent`; new cookie `cwr_attribution`; new data-layer event
`cwr_consent_update`.

### Level 2 — Dependent
- `submit-actions.ts`, `chat-handoff.ts` call `fetchLeadTracking`/`scheduleMetaLead` with unchanged signatures.
  Risk: low — new behavior is inside; existing form e2e tests cover them.
- `useConsent` callers (`ConsentManager`) unchanged; `AttributionField` reads the same `sessionStorage`. Risk: low.
- `src/lib/admin/health/queries.ts` returns rows typed `HealthCheck`; the new name widens the union. Risk: low —
  `getHealthNotices` handles unknown-to-rule names by skipping stale rules.
- `cwr.check_stale_health` only names specific checks, so `meta_conversions` raises no database problems. Risk: none.
- `middleware.ts` runs for `/consent` (redirect lookup, CSP header on a 204). Risk: low — no redirect is stored for
  `/consent`; the 1.5-second lookup limit applies.
- Every public page's client bundle gains a few hundred bytes (`consent-sync.ts`, address restore). Risk: low —
  no new library; the 200 KB script budget (Lighthouse CI) is far away (155 KB measured in Phase 6).

### Level 3 — Cascading
- Google and Meta (owner's accounts): first page views may now carry a click ID; Meta server events carry `fbc`
  more often. Risk: requires plan entry (done: D4–D6) — this is the intended improvement.
- Problem emails (paused today) will include `tracking.meta_send` once resumed. Risk: low — grouped, labels only.
- Production rollout needs migration `20261021000100` before the code that writes `meta_conversions`; otherwise
  `touch_health_check` fails its name check, which is caught and logged (lead unaffected). Risk: requires owner
  follow-up (listed below).
- No item needs extra human approval beyond the owner's 2026-10-21 request recorded in the header.

## Risks, decisions and rollback

- **Top risks:** (1) consent leak through the new cookie or a withdrawal — mitigated by server-side consent and
  GPC checks, the denied update before the wait, and cookie deletion after it (edge cases 1–8); (2)
  out-of-order consent answers — one call at a time, newest last (D15); (3) double page views and double tag
  fires — restore only before the first start (D4), the update event only for a newly allowed category, and
  "Once per page" (D13); (4) Google check false alarms — three-state result, never block saving (D1); (5)
  migration order in production — owner follow-up 1, and the failed health write is caught and logged.
- **Decisions:** D1–D18 above, each with rejected alternatives.
- **Rollback:** every step is its own commit, so `git revert <sha>` undoes one fix. The migration is expand-only:
  the code stops writing `meta_conversions` after a revert; a down step if ever needed is
  `delete from cwr.health_checks where name = 'meta_conversions'; delete from cwr.problem_catalog where action in ('tracking.meta_send', 'site.consent');`
  then restore the previous name check (the list in `20261012000200`). Visitors' `cwr_attribution` cookies are
  harmless after a revert (nothing reads them) and expire within 90 days.

## Verification commands

Run from the worktree root. Stop any server already on port 3100 first (Playwright reuses it locally, and it
would not have the test-only `TAG_MANAGER_CHECK_ORIGIN`).

```
npm run lint
npm run typecheck
npm test
npm run errors:check
npm run design:check
npm run db:check
npm run db:catalog
# with the local Supabase stack running (Docker):
npm run db:test
npm run db:lint
npm run build && npx playwright test tests/e2e/tracking tests/e2e/privacy.spec.ts
```

Expected at the end: every command exits 0; `npm test` shows the baseline 1114 passed plus the new unit tests;
`db:catalog` reports 125 actions; `db:test` includes `240-meta-send-health` (6 tests). Then reset the local
database and import real content (step 11).

## Owner follow-ups (after the code is merged — not implementer steps)

1. Approve applying migration `20261021000100_cwr_meta_send_health.sql` to production **before** the deploy that
   carries this code (a developer applies it; this plan applies nothing to production).
2. In Tag Manager, follow the updated runbook: add the Conversion Linker and the Google tag with the `AW-…` ID
   (§2); on all four tags — the GA4 Google tag, the Google Ads Google tag, the Conversion Linker, and the Meta
   Pixel base tag — add the second trigger `cwr_consent_update`, set **Once per page**, and require additional
   consent (`analytics_storage` for GA4, `ad_storage` for the other three) (§2); check the Pixel ID match (§8).
   Then publish the container.
3. In Google Ads, turn on enhanced conversions and accept the customer data terms (§6) before the first
   closed-deal upload.
4. Optional: retargeting setup (§10), keeping to the housing rules.
5. After the first real lead, open Ads & analytics and confirm "last lead sent to Meta" shows a date.

## Sources

- Google Tag Platform, "Consent mode overview" (basic vs advanced; general vs advertiser-specific modeling):
  developers.google.com/tag-platform/security/concepts/consent-mode
- Google Ads Help, "Updates to your enhanced conversions settings" (answer 16884284; one switch from June 2026,
  Goals → Settings → Customer data use) and "Configure the Google tag for enhanced conversions for leads"
  (answer 11021502; customer data terms).
- Google Platforms Policies, "Personalized advertising for housing, employment, and credit" (answer 9994064; no
  age, gender, parental status, marital status, or ZIP targeting in the US and Canada).
- Analytics Mania, "Google Tag Manager 404 error (gtm.js 404)" and "What is Conversion Linker"; Complianz, "Google
  Tag Manager 404 GTM.JS error"; Simo Ahava, "Basic Consent Mode: the guide" (custom consent event triggers).
- Meta for Developers, "fbp and fbc parameters" (format, building `fbc` from `fbclid`, milliseconds); Meta Business
  Help, Special Ad Categories; Meta error 190 (invalid or expired token).
- WebKit, "Tracking Prevention in WebKit" (script-written cookies capped at 7 days; third-party IP responses
  capped; link-decoration cap of 24 hours).
- MDN, `Set-Cookie` (HttpOnly, Max-Age); IETF RFC 6265 §5.3 and RFC 6265bis (a script can't overwrite an
  HttpOnly cookie).
- Next.js docs, "Linking and navigating — Native History API" (`replaceState` integrates with the router).
- GA4 enhanced measurement, "page changes based on browser history events" (listens to `replaceState`).
- OWASP CSRF Prevention Cheat Sheet (verify `Origin`; reject cross-site unsafe methods).
- Cloudflare Workers Rate Limiting binding (keys per visitor), as already used in `src/lib/security/rate-limit.ts`.

## Plan audit record

The owner's standard: grade reliability, consistency, security, privacy, maintainability, and testability, plus the
eight strict-process components, validate against leading sources, revise anything below A, at most 5 passes.
Each pass was a fresh independent grader that read the plan and the code and checked sources online (Google
consent-mode overview, Google Ads Help 16884284, Tag Manager Help on additional consent and tag firing options,
Analytics Mania and Complianz on gtm.js 404, WebKit tracking prevention, RFC 6265 §5.3, MDN Set-Cookie, Next.js
native History API, Meta fbp/fbc docs, OWASP CSRF cheat sheet). (The strict-process skill stops at 3 rounds; the
owner's own standard of 5 passes was followed.)

**Constitution check for finding 12:** Features §4 says "No tracking fires before consent where law requires it",
and the Phase 6 owner decision applies "ask first" to every visitor. Google's consent-mode overview says basic mode
sends nothing before consent and advanced mode sends cookieless pings before it. So basic mode stays (D12), and
D13 tightens it further: every tag also requires its own consent category.

| Criterion | Pass 1 | Pass 2 | Pass 3 | Pass 4 | Pass 5 | Final (after pass-5 wording fixes) |
|---|---|---|---|---|---|---|
| 1 Goal & scope | A | A | A | A | A | A |
| 2 Requirements & verification | C | C | B | B | A | A |
| 3 Grounding in the existing system | A | B | A | A | A | A |
| 4 Task breakdown | B | B | B | B | B | A |
| 5 Regression safety | A | B | A | A | A | A |
| 6 Downstream impact | A | A | A | A | A | A |
| 7 Risks, decisions & rollback | B | B | A | A | B | A |
| 8 Minimal footprint | A | A | A | A | A | A |
| Reliability | B | B | B | B | A | A |
| Consistency | B | C | B | B | B | A |
| Security | A | A | A | A | A | A |
| Privacy | B | C | A | A | A | A |
| Maintainability | A | B | A | A | A | A |
| Testability | B | B | B | B | A | A |

What each pass changed:
- **Pass 1 → 2:** the update event fires only for a newly allowed category, plus "Once per page" (double fires);
  one `/consent` call at a time, newest last (D15, out-of-order answers); boundary catch and `site.consent`
  (D18); container-warning recording through `reportProblem` (D14); cookie size cap (D16); same-click landing
  time (D17); Meta warnings only for refusals; corrected step dependencies; named missing tests.
- **Pass 2 → 3:** withdrawal tells tags "denied" before the wait and deletes cookies after it; the page-load call
  never rewrites the consent cookie; clock-skew tolerance; GA4 also requires `analytics_storage` (strict basic
  mode); passing Meta failures shown on the page; `sendMetaLead` returns `"sent" | "skipped"`; endpoint renamed
  `respondToConsentRequest`; rollback covers both catalog rows; `headerValue("set-cookie")`.
- **Pass 3 → 4:** withdrawal update uses only what both choices allow; `getEarlierLanding` moved to step 5;
  problem-log read wired into `Promise.all` and `reportPageLoad`; `keepAttribution` semantics and the
  `applyAllowedConsent` return value; owner follow-up 2 lists all four tags; `savedSuffix`.
- **Pass 4 → 5:** step 9 before step 7; `isSameAttribution` placement and test name; the passing-failure note
  names "a try", never "the last"; blocked storage makes no call; one recorded "didn't load" message.
- **After pass 5:** the grader's three wording fixes were applied word for word (edge row on the update event,
  step 9's check, edge row on passing failures). No sixth pass was run because of the 5-pass limit; these were
  the only items below A, and each was a single sentence the grader wrote out.

## Build notes

Deviations and choices made while building, each the smallest option faithful to the plan.

- **Step 0 — e2e command.** `npx playwright test tests/e2e/tracking tests/e2e/privacy.spec.ts` also runs the whole
  `chromium` project, because `tracking` depends on it and Playwright does not filter dependency projects; 18
  unrelated `chromium` tests fail on a freshly reset local database (listing photos and content need imported
  content), so the tracking tests never ran. Running tracking and privacy together with `--no-deps` makes the two
  "without trackers" privacy tests fail, because the tracking tests turn the banner on for the whole site at the
  same time. The baseline and every later check therefore run
  `npx playwright test --no-deps --project=chromium tests/e2e/privacy.spec.ts` and then
  `npx playwright test --no-deps --project=tracking tests/e2e/tracking`. Baseline: privacy 3 passed, tracking 15
  passed. `npm run db:test` passes (24 files, 312 tests) only on a freshly reset local database; real content or
  data left by e2e runs fails four older files, so every database check here runs after
  `npx supabase db reset --local`.
- **Step 1 — pgTAP 160.** `160-visitor-problems.test.sql` counts the catalog rows in area `site` (10). The plan's
  own `site.consent` row makes it 11, so that one count and its sentence were updated ("ten visitor actions"),
  although DO NOT TOUCH lists pgTAP files 000–230. Nothing else in the file changed.
- **Step 2 — one helper for check plus record.** `container-check.ts` also exports
  `checkSavedContainer({ containerId, action })` (null for a blank ID; otherwise asks Google, then calls
  `reportContainerStatus`), so the save action and the page do the same two steps the same way. The
  "couldn't check" status line uses the muted alert icon, because the container is not confirmed.
- **Step 6 — `getConsentReissue` takes `isSecure`.** R7 lists `{ cookieValue, isGpcOn, now }`; the re-issued
  cookie must keep `Secure` on https like the browser's copy (protected behavior 6), so the endpoint passes
  `isSecure` (from the request address) as `getAttributionCookieString` already does.
- **Step 6 — expired click cookie as one constant.** `attribution.ts` exports `EXPIRED_ATTRIBUTION_COOKIE`
  (`cwr_attribution=; Path=/; Max-Age=0; SameSite=Lax`), used by the endpoint and by `forgetAttribution`, so
  both delete the same host-only, `Path=/` cookie.
- **Step 5 — `getEarlierLanding` keeps the whole earlier landing.** When the click IDs match, the earlier
  landing is kept as it was (landing page and campaign tags too, not only `landedAt`): an address restored by
  D4 carries the click IDs but no campaign tags, so taking anything from the later landing would lose them.
  `isSameAttribution` compares every parameter, the landing page and the landing time.
- **Step 7 — port 3100 held by another session.** From 13:11 on 2026-10-21 another worktree's server
  (`admin-timeout-signout-button-6cbf74`) listened on port 3100, so Playwright reused it and served that
  worktree's build (edge case 27). It was not stopped, because it belongs to another session. From step 7 on, the
  e2e runs use an uncommitted scratch config (`playwright.port3200.config.ts`: the repo config with port 3200 and
  no server reuse), deleted before the end. The earlier step 2, 4 and 9 runs used this worktree's build (their new
  tests could only pass on it).
- **Step 7 — privacy policy date.** The Advertising line gains the `cwr_attribution` cookie as R8 says; the
  "Last updated" date (September 25, 2026) was left as is, since the plan does not mention it. The owner may want
  it changed when this ships.
- **Step 11 — results (2026-10-21, on a freshly reset local database).** `lint`, `typecheck`, `errors:check`,
  `design:check`, `db:check`, `db:lint` exit 0; `npm test` exit 0 — 120 files, 1181 passed, 2 skipped (baseline 115
  files, 1114 passed); `db:catalog` exit 0 — 125 actions; `db:test` exit 0 — 25 files, 318 tests, including
  `240-meta-send-health` (6); `npm run build` exit 0; privacy e2e exit 0 — 3 passed; tracking e2e exit 0 — 24
  passed (baseline 15). The local database was then reset and `npm run content:import:local` run. The
  independent review is left to the session that asked for this build.
