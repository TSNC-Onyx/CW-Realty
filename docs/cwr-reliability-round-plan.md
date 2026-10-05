# CWR reliability round: Quick Check, listing photo gallery, chatbot, problem logging — plan

Status: APPROVED rev 4 (2026-10-02) — owner said "build it"; picks D1–D4 as recommended. Audit: rev 1 B-, rev 2 A-/B+, rev 3 A-; rev 4 fixes
the last two findings (changelog at the end). Kept outside the repo until the owner says "build it"
(memory: no-changes-unless-explicit). On approval it is copied to `docs/cwr-reliability-round-plan.md`.
**Built and merged** into `build1` by PR #23 (`f82e5ff`) on 2026-10-02.

Base: `build1` @ 6289a63. Branch: `claude/captcha-properties-chatbot-audit-94fda6` (worktree
`functional-test-loop-prompt-5e6c57`). Baseline checks on this base (2026-10-02): `npm test` 466/466,
`typecheck`, `lint`, `errors:check`, `db:catalog` (107 actions) all pass.

## Goal

Every visitor-facing "Quick Check", every listing photo, and the website chatbot work the same way every
time, fail in a way the visitor can recover from, and leave a record in the problem log whenever a
visitor sees an error.

## Sources used to grade this plan

| Area | Source |
|---|---|
| Bot check | Cloudflare Turnstile: server-side validation (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), client-side errors (…/troubleshooting/client-side-errors/), testing keys (…/troubleshooting/testing/) |
| Gallery | W3C APG Carousel (https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) and Dialog-Modal patterns; WCAG 2.2 SC 1.1.1, 2.2.2, 2.4.3, 2.5.7, 2.5.8; MDN `scroll-snap-type`; axe rule `scrollable-region-focusable` |
| Chatbot | Claude API errors (https://platform.claude.com/docs/en/api/errors); OWASP Top 10 for LLM Apps 2025 (https://genai.owasp.org/llm-top-10/) LLM01, LLM02, LLM07, LLM10 |
| Logging | OWASP Logging Cheat Sheet (https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html); ISO/IEC 25010 reliability (fault tolerance, recoverability) |
| Repo rules | `docs/constitution/01–04`, `docs/cwr-error-tracking-plan.md` (D5: the public site reuses the same pipeline), `docs/cwr-phase-5-chatbot-plan.md`, `docs/cwr-website-build-plan.md` open items 2–3 |

## What exists today (findings, with evidence)

### 1. Quick Check (Cloudflare Turnstile)
Used on: Contact form, TouchUp booking form, chat first message, chat "Talk to a person", admin sign-in,
admin forgot password. Server check: `src/lib/security/turnstile.ts`; admin forms are checked by Supabase Auth.

| # | Finding | Severity |
|---|---|---|
| Q1 | **The live site ships Cloudflare's always-pass TEST site key** (`1x00000000000000000000AA` found in the live JS, 2026-10-02). If the server holds a real secret, every form and chat is refused (siteverify answers `invalid-input-response`). If it holds the test secret, nothing is protected. Build plan open item 2 is still open. | Critical (owner setup) |
| Q2 | No failure is logged on public forms/chat: refusals, Cloudflare error codes, siteverify outages, missing secret (build plan open item 3, never built). This breaks the owner rule "customer-facing errors must be logged". | High |
| Q3 | Send/Submit is never held until the check finishes. A quick visitor is refused, especially in chat, where the check loads only when the panel opens. Tests hide this with `waitForBotCheck()`. | High |
| Q4 | Test-key answers skip the site/form match even in production (`turnstile.ts:32`). | Medium |
| Q5 | The public widget has no error/expired/timeout/unsupported handling: the visitor sees nothing and can't retry. | Medium |
| Q6 | Wording differs ("complete the quick check" vs chat "Reload the page"). With an invisible widget there is nothing to "complete". | Medium |
| Q7 | Admin forgot-password treats a failed check as "link sent" (`auth-outcomes.ts:89`). | Medium |
| Q8 | The siteverify call has no timeout and no retry, and throws away Cloudflare's error codes (`turnstile.ts:20-27`). | Low |
| Q9 | Contact/booking: `fetchVisitor`, `fetchLeadTracking` and `getFormConversion` are unguarded. A throw there shows the crash screen; `saveRequest` itself already catches. | Low |
| Q10 | Every widget gets the library's default container id `cf-turnstile` (`@marsidev/react-turnstile`), so two widgets on one page share an id. | Low |

### 2. Listed Properties photos
`ListingDetail` (`src/components/content/listing-detail.tsx`) shows photo 1 large, then every other photo
as a static 2-column grid. There is no click, zoom, swipe, keyboard control, or counter. Cards
(`listing-card.tsx`) show photo 1 only, and the whole card is one link (Style §11.10). Real listings have
8, 4, 1 and 1 photos; there is no upper limit. Alt text is required (DB: 1–250 chars).

No carousel exists on `build1`. One exists on the unmerged local branch `claude/selected-services`, but
it is coupled to plans. Style §11.15 requires an owner-approved constitution entry for a new component;
§11.5 allows icon-only buttons only for Close/Dismiss and hero pause/play. The CSP forbids inline styles,
which rules out next/image and most carousel libraries.

### 3. Chatbot
Fully built and tested against a fake model, but **never live**: production has 0 published policies and
0 chats, and the Worker secret `ANTHROPIC_API_KEY` is unconfirmed. Current setup: model `claude-opus-5`,
effort low, 30 s timeout + 1 retry, structured output, server-side refusal fallback, cached system
prompt. It answers only from the owner's published policy (Features §2).

| # | Finding | Severity |
|---|---|---|
| C1 | Not live: policy not written, tested, or published. The API key and launch steps are missing from the open-items table, and there is no runbook. | Critical (owner setup) |
| C2 | The chat widget freezes ("The assistant is replying…" forever, Send stays busy) if the server call throws, e.g. a new deploy while the page is open or a dropped connection. Nothing is reported. | High |
| C3 | Every chat failure is console-only: model errors and timeouts, refusals, cut-offs, no key or no policy, hand-off failure (a lost lead), save failure, limiter outage, hourly cap reached. | High |
| C4 | No owner off switch short of deleting the API key. | Medium |
| C5 | Worst-case wait for a first message ≈ 10 s (siteverify) + 60 s (30 s × 2 tries), with no "still working" cue. | Low |

### 4. Problem logging
Built for admin, sign-in, jobs, and DB jobs only. Public forms, chat, and public pages are out of scope
by decision D5 ("follow-up plan, same pipeline"). This plan is that follow-up, limited to the three areas
above. Flood control today (`cwr.is_problem_flood`, migration lines 485–516) is one 60-second bucket:
- per origin, for most origins;
- per member, for member origins;
- shared, for all server-side critical problems (300/min).

`problem_groups.suppressed_count` counts what was dropped. Problem emails are paused (no free Cron
Trigger) and the Problems page is not built, so records are read with SQL today. `problem_events` stores
no IP address.

## Scope

**In scope**
1. The Quick Check on all six forms above: consistent behaviour, gating, recovery, wording, logging, tests.
2. Listing detail gallery (click and swipe through every photo, full-screen viewer), plus a photo count on cards.
3. Chatbot reliability fixes, an owner off switch, and the setup steps: open items and a launch runbook.
4. Public-site problem logging for exactly these areas: forms with a Quick Check, chat, hand-off, gallery.
5. Full test pass (unit, pgTAP, e2e, axe) and a local browser check at phone and desktop width.

**Out of scope** (listed so nothing creeps in)
- Problems page; resuming problem emails (open items 10–11).
- Logging crashes on other public pages (`app/(site)/error.tsx`, `onRequestError` for public paths). This is the recommended next follow-up.
- Widening `errors:check` / ESLint `no-console` to `src/lib/chat|forms|security`. This is a separate refactor and a follow-up.
- Changing the chat model, timeout, or knowledge sources; live person chat; a code-level daily spend cap (the Claude Console spend limit is used instead, T2).
- The unmerged branches `claude/listing-statuses`, `claude/selected-services`, `claude/video-auto-cover`.
- Listing card swipe (D1), the admin photo editor, photo encoding.
- Supabase `public` schema, auth internals, DNS.

## Owner decisions needed (plain UX questions; each has a default so the build never stalls)

| # | Question | Default (recommended) |
|---|---|---|
| D1 | On the Listings page, should each card get swipe arrows, or keep one photo with a small "8 photos" label? | **Label.** Arrows inside a card fight with "the whole card is one link" and are small on phones. |
| D2 | Approve the gallery look: big photo with ‹ › arrows and "3 of 8", a row of thumbnails, tap the big photo for full screen. The arrows are icon-only, which needs a §11.5 exception like the hero pause button. | Approve. |
| D3 | Should production refuse Cloudflare's test keys? | **Yes**, switched on in the same release only after the real keys (T1) are in. Local preview and automated tests keep using test keys through an explicit setting. |
| D4 | Add an owner-only "Assistant on/off" switch on the Chat policy page? When off, every visitor gets the "talk to a person" form. | Yes. |

## Owner tasks (outside the code; step-by-step goes in the runbook)
- T1 (Q1, urgent): in Cloudflare → Turnstile, create a widget for `cw-realty.onyxventuresnc.workers.dev` (and the final domain at launch). Put its **site key** in the Worker build variable `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and its **secret** in the Worker secret `TURNSTILE_SECRET_KEY`, then redeploy. In Supabase → Auth → Bot protection, use the same secret.
- T2 (C1): add the Worker secret `ANTHROPIC_API_KEY`. In the Claude Console, set a monthly spend limit for the key's workspace (LLM10 cost ceiling). On Admin → Chat policy, write the policy, add test questions, pass a test run, and publish.
- T3: approve the production database update (one migration) before merge.

## Architecture context
- **Stack:** Next.js 16 App Router on Cloudflare Workers (OpenNext), Supabase (`cwr` schema, RLS), a strict nonce CSP (no inline styles), and Tailwind 4 with design tokens (`npm run design:check`).
- **Problem pipeline:** server code calls `reportProblem()`; the browser calls `reportClientProblem()` → `POST /admin/problems/report` (public in middleware via `PUBLIC_ADMIN_PATHS`). Both feed `cwr.record_problem`, which scrubs, flood-caps, groups, and spike-detects (`spike_codes`, server origins only) and issues `CWR-XXX-XXX` references.
- **Who sees what:** visitors never see a reference code; only the owner reads the log.

## Threat model for visitor problem reports
Browser reports are **untrusted hints**: `Origin` and `pagePath` can be forged by a script. Therefore
visitor browser reports:
- carry **no free text**: `detail` and `shownMessage` are dropped; only an allow-listed action plus an allow-listed code are kept;
- are capped at `warning`;
- are flood-capped **per action** (so one noisy action cannot hide another);
- never share the server-critical bucket.

The worst an attacker can do is fill one action's bucket for 60 seconds. That shows up as a rising
`suppressed_count`, and server-side records (which a browser cannot forge) still get through.

## Task breakdown

### Phase 0: Safety net
0.1 Record the baseline before any change: `npm test`, `typecheck`, `lint`, `errors:check`, `design:check`, `db:test`, `db:check`, `db:catalog`, and the full `test:e2e` with test keys. Write down any pre-existing failure; do not fix it silently.

### Phase 1: Problem logging for visitors (foundation for 2–4)
1.1 Add a migration, `supabase/migrations/<ts>_cwr_visitor_problems.sql` (a new file; merged migrations are never edited):
  - Origins: add `server_visitor` and `browser_visitor` to the `problem_events.origin` check (drop and re-add the constraint), and to the origin normalisation line in `cwr.record_problem`. Replace the function body copied verbatim except that line, so admin behaviour is unchanged.
  - Flood limits:
    - `cwr.get_problem_bucket_limit`: `server_visitor` 60/min, `browser_visitor` 20/min.
    - `cwr.is_problem_flood`: visitor origins count per (origin, action, severity band: below error / error and above) and are excluded from the shared server-critical bucket. So a bot flood of info refusals can't suppress a critical setup record. Existing branches stay identical.
  - Catalog: insert rows in section "Website visitors":

    | Action | Spike code |
    |---|---|
    | `site.contact_form` | none |
    | `site.booking_form` | none |
    | `site.bot_check` | none (setup problems are recorded directly as critical, see 2.1) |
    | `site.bot_check_widget` | none |
    | `site.chat_message` | none |
    | `site.chat_assistant` | none |
    | `site.chat_handoff` | none |
    | `site.chat_widget` | none |
    | `site.listing_photo` | none |
    | `chat_policy.set_assistant` | none (admin action, `fn` = the new server action) |
  - Off switch (D4): `alter table cwr.site_settings add column is_assistant_on boolean not null default true`. A `BEFORE INSERT OR UPDATE` trigger rejects setting it to anything but the existing value (insert: anything but `true`) unless the caller is an owner of that tenant, or the database role is explicitly `service_role` or `postgres` (`current_user in ('postgres','service_role')`: migrations, import script, pgTAP setup). A null `auth.uid()` alone never passes. The trigger function is `security invoker` with `set search_path = ''` (so `current_user` is the real caller), and checks ownership through `cwr.owner_tenant_ids()`. This covers the contact page's upsert (`contact/actions.ts:33`), since managers can already insert and update `site_settings`. The existing audit trigger records the change.
1.2 Mirror the same catalog entries and section in `src/lib/observability/problem-catalog.ts`; add the new origins to `problem-types.ts`.
1.3 Add `src/lib/observability/report-visitor-problem.ts` (server-only): a wrapper over `reportProblem` that sets origin `server_visitor` and tenant from `fetchChatTenantId`-style lookup. It stores the error class, status, or code only, never visitor text, and never throws.
1.4 Update `app/admin/problems/report/route.ts` and `problem-report-rules.ts`. When the sender is signed out, the page path is not under `/admin`, and the action is in `VISITOR_BROWSER_ACTIONS = [site.bot_check_widget, site.chat_widget, site.listing_photo, site.contact_form, site.booking_form, site.chat_handoff]` (the last three for stale-page reports, Addendum A):
  - record as `browser_visitor`, severity capped at `warning`;
  - drop `detail` and `shownMessage`;
  - keep the code only if it is in `VISITOR_BROWSER_CODES = [script_failed, widget_error, unsupported, timeout, test_site_key, missing_site_key, action_failed, stale_page, image_failed]`.

  The existing same-site check, 8 KB cap, Zod schema, and `PROBLEM_REPORT_RATE_LIMITER` (20/min per IP) are reused, so no new Cloudflare namespace is needed and there is no account-quota risk. The sign-in and member paths are unchanged.
1.5 Update `report-client-problem.ts`: add a visitor mode with no localStorage queue (there is no user to tie it to) and the `sendBeacon` fallback only.
1.6 Update the dashboard: `src/lib/admin/health/queries.ts` and `src/components/admin/dashboard/problems-card.tsx` keep their current count (member, sign-in, job, and database origins) and add a separate "Website visitors" line.
1.7 Tests:
  - pgTAP:
    - new origins accepted, flood-capped per action, and readable by owners only;
    - visitors and browsers cannot call `record_problem`;
    - **snapshot: every existing origin's bucket limit and flood partition returns exactly what it did before**;
    - the owner-only trigger on `is_assistant_on`: owner can change it; a manager can't by update **or** upsert; a manager's contact-details upsert without the column still works; service role can; anon is refused;
    - `db:catalog` count goes from 107 to 117.
  - Unit: allow-list, code allow-list, text dropped, severity cap, visitor mode.
  - e2e: a signed-out report from `/listings/x` is stored without text; one claiming an `/admin` path while signed out is still refused as today.

### Phase 2: Quick Check
2.1 Update `src/lib/security/turnstile.ts`:
  - `checkTurnstileToken()` returns `{ ok, reason, errorCodes }`. `verifyTurnstileToken()` stays as a boolean wrapper so callers barely change.
  - Use a 5 s `AbortSignal.timeout` and **one** retry with the same `idempotency_key` (UUID per check) on network failure, HTTP 5xx, or `internal-error`. Worst case is about 10 s.
  - Map Cloudflare's error codes to reasons:

    | Cloudflare code / condition | Reason | Severity |
    |---|---|---|
    | `missing-input-secret`, `invalid-input-secret`, or no secret in production | `not_configured` | critical |
    | `missing-input-response`, or an empty token | `no_token` | info |
    | `invalid-input-response` | `rejected` | info |
    | the server's **own** build setting `NEXT_PUBLIC_TURNSTILE_SITE_KEY` matches `^[123]x0{20}`, or a testing-key reply arrives, in production while test keys are not allowed | `test_key_in_production` | critical, recorded at most once per Worker isolate — decided from the site's own settings, never from what a visitor sends, so it can't be faked (Q1) |
    | a visitor sends the dummy token `XXXX.DUMMY.TOKEN.XXXX` to a site with a real key | `rejected` | info (ordinary bot noise) |
    | `timeout-or-duplicate` | `expired` | info |
    | success but wrong action or hostname | `wrong_site` | critical |
    | test-key answer in production while test keys are not allowed (D3) | `test_key_in_production` | critical |
    | network failure, 5xx, or `internal-error` after the retry | `unreachable` | warning |
    | `bad-request` | `unreachable` | warning |
  - Test keys are allowed when `NODE_ENV !== "production"` **or** `ALLOW_TURNSTILE_TEST_KEYS === "true"` (server) / `NEXT_PUBLIC_ALLOW_TURNSTILE_TEST_KEYS === "true"` (browser report in 2.3). Set both explicitly in `scripts/local-test-env.sh` and in the `.github/workflows/ci.yml` e2e job, so `npm run preview` and e2e (production builds) keep working and record nothing.
  - The server record (not the browser one) is the authoritative alarm: server origins are not warning-capped.
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is inlined by Next.js at **build** time, so the server's check sees the key the deployed bundle was built with, exactly the one visitors' browsers use. That is the right thing to compare. Unit tests set the variable in the test environment (`vi.stubEnv`) rather than assume a runtime read.
2.2 Callers (`submit-actions.ts`, `send-chat-message.ts`, `chat-handoff.ts`) report every non-pass result as `site.bot_check`, with the reason as code and Cloudflare codes in `detail`. The visitor never sees a reference.
2.3 Add a client hook, `src/components/forms/use-bot-check.ts`, and update `TurnstileField`:
  - States: `checking | ready | failed | expired`.
  - Wire `onSuccess`, `onError`, `onExpire`, `onTimeout`, `onUnsupported`, and script `onError`.
  - Give each widget its own `id`, and reset via `key`.
  - Report `site.bot_check_widget` once per page view on error, unsupported, or a 10 s timeout.
  - **In a production build without `NEXT_PUBLIC_ALLOW_TURNSTILE_TEST_KEYS`, a site key matching `^[123]x0{20}` or a missing site key sends one `test_site_key` / `missing_site_key` report.** This is an early hint (warning) before any form is sent; the critical record comes from the server (2.1).
2.4 Gate submission: Contact, booking, chat composer, and hand-off form disable Send until the check is `ready`, with a polite status line, "Running a quick check…".
  - On failure, or still checking after 10 s: "The quick check didn't load. [Try again]". The button resets the widget, and the line also shows the office phone number.
  - With no site key in production, show the phone line only.
  - Expired → back to "checking"; the library refreshes the token automatically.
2.5 Use one wording everywhere, from a new file, `src/lib/security/bot-check-messages.ts`. Refusal: "Our quick check didn't go through. Wait a moment and try again." This replaces chat's "Reload the page".
2.6 Admin sign-in and forgot-password (`sign-in-bot-check.tsx`, `login-form.tsx`, `password-forms.tsx`, `auth-outcomes.ts`):
  - same gating;
  - forgot-password shows the refusal message on `captcha_failed` instead of "link sent", still without revealing whether an email exists;
  - the existing `auth.bot_check_widget` reporting is unchanged.
2.7 `submit-actions.ts`: a top-level try/catch → "failed" state plus a `site.contact_form` / `site.booking_form` error report (mirrors `chat-actions.ts`).
2.8 Tests:
  - Unit:
    - every row of the 2.1 table, including a forged dummy token on a real-key site (info, not critical), plus timeout, retry once with the same idempotency key, action mismatch alone, and dev with no secret;
    - `ALLOW_TURNSTILE_TEST_KEYS` on and off;
    - submit-actions blocked, failed, and crash paths.
  - e2e:
    - Cloudflare's always-fail site key `2x00000000000000000000AB`: the retry line appears and Send stays off;
    - the force-interactive key `3x00000000000000000000FF`: Send stays disabled until solved;
    - a refused check is recorded;
    - a second chat message needs no check;
    - the production-build test-key report is sent once.
  - New tests wait on the visible "ready" state, not on `waitForBotCheck()` timing.

### Phase 3: Listing photo gallery
3.1 Add `src/components/content/photo-gallery.tsx` (client): generic, photos in, no listing knowledge. Styles go in `app/globals.css` (no inline styles, CSP-safe).
  - **Track:** a native CSS scroll-snap track (`scroll-snap-type: x mandatory`), so touch swipe and trackpad work with no gesture JS. The track itself is **not** in the tab order.
  - **Slides:** each slide's photo is wrapped in a `<button>` with no `aria-label`; its name is the photo's alt text plus visually hidden text ", photo N of M, open full screen", so screen readers hear the description (WCAG 1.1.1). Only the current slide's button is tabbable (`tabindex=-1` on the others). This satisfies axe `scrollable-region-focusable`.
  - **Keyboard:** the gallery root handles ←/→ with `preventDefault()` and scrolls programmatically to the slide, so there is no double step with native scrolling. If focus was on a slide button, focus moves to the new current slide's button (`preventScroll`), so focus is never left on a hidden slide (WCAG 2.4.3, 2.4.11). Focus on ‹ › or a thumbnail stays where it is.
  - **Controls:**
    - ‹ › buttons, 48 px, `aria-label` "Previous photo" / "Next photo", `aria-disabled` at the ends, no wrap-around;
    - a "N of M" counter;
    - thumbnails: plain buttons ≥ 48 × 48 px, label "Show photo N of M", `aria-current="true"` on the current one, in their own horizontally scrolling row (never page scroll).
  - **Semantics:** the root is a `section` with `aria-roledescription="carousel"` and label "Photos of <address>". Each slide is `role="group"`, `aria-roledescription="slide"`, `aria-label="N of M"`. A polite live region speaks "Photo N of M" only after the visitor moves. There is no auto-rotation, so WCAG 2.2.2 needs no pause control.
  - **Current photo:** read from scroll position (`scrollend`, with a `scroll` + rAF fallback for browsers without `scrollend`), so a phone rotation or resize re-syncs.
  - **Loading:** photo 1 is eager + `fetchPriority=high` (LCP unchanged); the others are lazy. Reduced motion → instant jumps.
  - **Few photos:** 0 → placeholder (admin draft preview). 1 → no arrows, counter, thumbnails, or carousel roles.
  - **Alt text** is the admin `alt_text` (the DB already requires 1–250 characters after trimming); a defensive fallback "Photo N of M, <address>" covers drafts only.
3.2 Add the full-screen viewer, `photo-lightbox.tsx`: a native `<dialog>` opened with `showModal()`, following the APG modal pattern.
  - Focus moves to Close; Esc and Close both close it; focus returns to the slide button that opened it; the background is inert.
  - It uses the same track at full width (`sizes="100vw"`, 1920 px files), and the same swipe, arrows, and keys. Body scroll is locked with a class.
  - **History state machine:**
    - Open: `history.pushState({ cwrPhotoViewer: true }, "")`.
    - Close by Esc (dialog `cancel` is prevented) or by the Close button: if `history.state?.cwrPhotoViewer`, call `history.back()`; otherwise close directly.
    - `popstate` without that state: if the dialog is open, `dialog.close()`. This is the only place it actually closes after a history step, so Back, Esc, and Close can't race.
    - On mount: if `history.state?.cwrPhotoViewer` (reload or deploy while open), `history.replaceState(null, "")` and stay closed.
3.3 `listing-detail.tsx`: replace the static grid with `PhotoGallery`. The status tag stays on the photo. The admin preview inherits the gallery (intended).
3.4 D1 = label: `listing-card.tsx` adds "N photos" text on the photo when there is more than 1. The card stays one link.
3.5 Image load failure (`onError` on the `<img>`) → placeholder, plus one `site.listing_photo` / `image_failed` warning per photo per page view.
3.6 Constitution: the owner approves new §11 entries ("Photo gallery", "Full-screen photo viewer", and the §11.5 arrow exception). The developer drafts the text; it is inserted only after approval, because the constitution is owner-authored.
3.7 Tests:
  - Unit: index math, the ends, 0, 1 and 2 photos, alt fallback.
  - e2e on a 3-photo fixture listing (added to `tests/fixtures/test-content.json`):
    - next and previous, thumbnail jump, ←/→ keys, swipe (scrolling the track);
    - open and close the viewer by Close, by Esc, and by Back, each leaving the visitor on the listing;
    - focus returns to the opener; a reload with the viewer state opens closed;
    - counter text; every `img` has alt;
    - axe at 375 px and desktop; no horizontal page scroll at 320 px; design rules pass.

### Phase 4: Chatbot
4.1 `use-chat-conversation.ts` and `chat-composer.tsx`: wrap the server call in try/catch/finally, so the pending state always clears and Send re-enables.
  - On a thrown error: "We couldn't reach the assistant. Try again, or tap Talk to a person." plus a `site.chat_widget` `action_failed` report.
  - On a stale deploy (detected by the existing `call-server-action` helper's check): "This page was updated. Reload to keep chatting." plus a `stale_page` report.
  - After 15 s pending, the line changes to "Still working, this can take up to a minute. You can also tap Talk to a person."
4.2 `claude-model.ts`, `answer-question.ts`, `send-chat-message.ts`: record `site.chat_assistant`, classified by **SDK error class / status** (per the Claude API errors page), with the Anthropic `request-id` in `detail` and no visitor text:

    | Condition | Severity |
    |---|---|
    | 400 `BadRequestError` (includes the organisation spend limit and a retired model id), 401, 402, 403, 404 | critical |
    | 429 without a `retry-after` header (tier spend cap: "keeps failing until access resumes") | critical |
    | 429 with `retry-after`, 500, 504, 529, `APIConnectionTimeoutError`, `APIConnectionError` (after the SDK's own retry) | warning |
    | `stop_reason` refusal (after fallback), `max_tokens`, unreadable structured output | info |
    | no API key, or no published policy | warning (one group; the flood cap keeps it small) |

    The visitor experience is unchanged (graceful hand-off). Model, effort, timeout, and fallback are unchanged.
4.3 `chat-actions.ts` and `chat-handoff.ts`: replace console-only logging with reports.
  - `site.chat_message`: error.
  - `site.chat_handoff`: error, because it is a lost lead. The visitor sees the phone number and email.
  - `recordChatExchange` failing after a reply: error.
  - Hourly chat cap reached: warning.
  - `rate-limit.ts` limiter outage: one warning per isolate.
4.4 Off switch (D4):
  - Chat policy page (owners only): a new "Assistant on/off" control.
  - Server action `setAssistantOnAction` in `src/lib/admin/chat-policy/actions.ts` through `runAdminAction({ action: "chat_policy.set_assistant", roles: ["owner"] })`.
  - Read in `send-chat-message.ts`: when off, reply with the existing hand-off text and make no model call.
4.5 Setup docs:
  - `docs/cwr-website-build-plan.md` open items: add `ANTHROPIC_API_KEY` + Console spend limit, `CHAT_RATE_LIMITER` namespace 1002, and real Turnstile keys plus the Supabase captcha secret (updating item 2).
  - Item 3 is marked done by this plan.
  - New `docs/runbooks/chatbot-launch.md`: key, spend limit, write → test → publish, off switch, and how to read `site.*` problems with SQL until the Problems page exists.
4.6 Tests:
  - Unit: each row of the 4.2 table, using SDK error classes constructed in the test.
  - e2e: a thrown action leaves chat usable; the off switch hands off; the control is owners-only (manager refused).
4.7 After T2, run an owner-approved live smoke test: 3 real questions on the deployed site, a few cents. Record p95 reply time; if it is > 20 s, propose a timeout change as a follow-up.

### Phase 5: Verification
5.1 Run every check from 0.1 again plus the new tests, then `npm run build`, then a `npm run preview` (Worker runtime) smoke test of forms, chat, and gallery.
5.2 Browser check at 375 px and 1280 px.
5.3 Reset the local DB and re-import real content before any preview shown to the owner (memory rule).
5.4 Run a subagent review against this plan; fix the gaps; re-review.
5.5 Rollout order:
  1. Owner T1 keys.
  2. Apply the prod migration (T3).
  3. Merge the PR, only on the owner's ask.
  4. Deploy.
  5. Read the `site.*` problems for 24 h.

  Problem-email pause stays as is.

## Assumptions
- A1 The live site key is the test key because the build variable was set to it (seen in the live JS). The server secret is unknown; the new server `test_key_in_production` record shows the problem either way (its own test site key, or a testing-key reply).
- A2 Signed-out browsers can POST to `/admin/problems/report`. It is in `PUBLIC_ADMIN_PATHS`; covered by test 1.7.
- A3 `PROBLEM_REPORT_RATE_LIMITER` (20/min per IP) is enough for visitor reports; no new rate-limit namespace is needed.
- A4 Listings stay at roughly 40 photos or fewer; the gallery lazy-loads.
- A5 The unmerged branches conflict only lightly (`listing-detail.tsx`, `listings.ts`). Whichever lands second rebases and re-runs e2e.
- A6 The chat model stays `claude-opus-5`; changing it is the owner's call.
- A7 Workers limits are not at risk: at most 2 siteverify + 2 Claude subrequests per message (the limit is 50), and waiting on fetch does not count as CPU time.

## DO NOT TOUCH
- `docs/constitution/*`, except the owner-approved §11 additions (3.6).
- Merged migrations (every existing file in `supabase/migrations/`).
- The `public` schema, `auth`/`storage`/`vault` internals, existing cron jobs, and `wrangler.jsonc` crons and rate limits.
- The problem-email pause (`ARE_PROBLEM_EMAILS_PAUSED`, crons `[]`).
- Admin problem behaviour (member and sign-in origins, caps, references, shared critical bucket). It must stay identical; pgTAP snapshot 1.7 proves it.
- Chat model, effort, timeout, prompt rules, restricted-data redaction, retention purge.
- `src/lib/content/media.ts` URL format, the photo encoder, the storage layout.
- Other branches and worktrees.

## Downstream Impact Analysis

### Level 1: Direct
Files:
- **Bot check:** `src/lib/security/turnstile.ts`, `bot-check-messages.ts` (new), `src/components/forms/turnstile-field.tsx`, `use-bot-check.ts` (new), `request-form.tsx`, `src/lib/forms/submit-actions.ts`.
- **Chat:** `src/components/chat/chat-composer.tsx`, `chat-handoff-form.tsx`, `use-chat-conversation.ts`; `src/lib/chat/send-chat-message.ts`, `chat-actions.ts`, `chat-handoff.ts`, `claude-model.ts`, `answer-question.ts`; `src/lib/security/rate-limit.ts`.
- **Admin sign-in:** `src/components/admin/auth/sign-in-bot-check.tsx`, `login-form.tsx`, `password-forms.tsx`; `src/lib/admin/auth-outcomes.ts`.
- **Chat policy admin:** `src/lib/admin/chat-policy/actions.ts`, `app/admin/(portal)/chat-policy/page.tsx`, `src/components/admin/chat-policy/*` (new toggle).
- **Gallery:** `src/components/content/listing-detail.tsx`, `listing-card.tsx`, `photo-gallery.tsx` (new), `photo-lightbox.tsx` (new), `app/globals.css`.
- **Problem logging:** `src/lib/observability/problem-catalog.ts`, `problem-types.ts`, `problem-report-rules.ts`, `report-client-problem.ts`, `report-visitor-problem.ts` (new), `client-problem.ts`; `app/admin/problems/report/route.ts`.
- **Dashboard:** `src/lib/admin/health/queries.ts`, `src/components/admin/dashboard/problems-card.tsx`.
- **Database, CI and env:** one new migration, `supabase/tests/database/*` (new and extended), `scripts/local-test-env.sh`, `.github/workflows/ci.yml` (one env line).
- **Tests and docs:** `tests/**`, `tests/fixtures/test-content.json`, docs.

Contracts:
- `verifyTurnstileToken` boolean signature kept.
- `cwr.record_problem(jsonb)` signature kept.
- `problem_events.origin` gains 2 values.
- `site_settings` gains 1 column.
- Catalog grows 107 → 117.

### Level 2: Dependent
- Admin problem recording (route, `record_problem`, flood) — risk **low**: changes are additive and the pgTAP snapshot proves the old origins are unchanged; `150-problem-tracking` must pass untouched.
- Admin sign-in and forgot forms — risk **low**: same widget, gating plus one message; `admin/auth.spec.ts` must pass.
- Contact page (`site_settings` editors) — risk **low**: the new column has a default and an owner-only guard; contact e2e must pass.
- Admin listing preview — risk **low**, intended.
- Dashboard problem card — **plan entry 1.6** (separate visitor line; existing count unchanged).
- Supabase Auth captcha (hosted setting) and Cloudflare keys — **human approval / owner task T1**.
- Production DB migration — **human approval T3**.

### Level 3: Cascading
- Problem alert emails (paused): when resumed, visitor critical problems (e.g. a broken Quick Check) would email owners. That is desired; the runbook says so. Risk low.
- Workers Observability log volume: slightly higher. Risk none.
- Anthropic spend: the Console spend limit, the off switch, and unchanged per-IP and hourly caps bound it (LLM10). Risk low.
- Ads/analytics events `cwr_chat_question` and form conversions: fire only on success, unchanged. Risk none.
- Unmerged branches: rebase conflicts in `listing-detail.tsx`. Risk low.

## Edge cases (most → least critical; chain = what goes wrong 1 → 2 → 3 levels down)

| # | Edge case (chain) | Solution |
|---|---|---|
| E1 | Test site key live with a real secret (today's likely state) → every visitor refused → leads lost, and it would look like normal bot filtering. | The server sees its own test site key in production and records a critical `test_key_in_production` once per isolate (critical band, so bot noise can't hide it); the browser adds an early warning; runbook T1. |
| E1b | A prankster sends Cloudflare's fake test token on purpose → fake "setup broken" alarms → owners start ignoring real ones. | A visitor's token never decides a critical record; on a real-key site it is an ordinary info refusal. |
| E2 | Someone floods the visitor problem reports → log fills → real visitor problems hidden. | No free text, fixed actions and codes, 20/min per IP, a per-action, per-severity-band 60 s bucket, never sharing the server-critical bucket; floods show as `suppressed_count`. |
| E3 | "Talk to a person" fails to save → visitor thinks they were heard → lead lost. | Error record; the visitor is told it didn't send and shown phone/email; the same idempotency key on retry means no duplicates. |
| E4 | Claude spend cap or billing problem → every chat hands off → owner never learns why. | 400/402/persistent 429 recorded as critical; visitors still get the hand-off form. |
| E5 | Test keys stay in production after the fix → no bot protection → spam leads and chat cost. | D3 refusal in production plus a critical `test_key_in_production` record. |
| E6 | Cloudflare check service is down → every form refused → lost leads. | 5 s timeout, one retry with the same idempotency key, then "try again or call" and a warning record. |
| E7 | Chat page left open during a deploy → server call fails → chat frozen. | Caught; "This page was updated. Reload to keep chatting."; Send re-enabled; recorded. |
| E8 | Claude busy or rate-limited → slow or failed reply → visitor leaves. | SDK retry once, then hand-off; warning record; a "Still working" line after 15 s. |
| E9 | Problem logging itself fails (database down) → no record. | The JSON log line is always written first (Workers Observability); the visitor is never blocked by logging. |
| E10 | Ad blocker blocks the check script → Send never enables → visitor stuck. | After 10 s or on error: a "Try again" button and the phone number; warning record (same-site, so not blocked). |
| E11 | Chat panel hidden or tab in background for more than 5 min → token expires → refused on send. | The widget refreshes itself; on expire, Send returns to "Running a quick check…" until a new token arrives. |
| E12 | Double-click on Send → two submissions → duplicate leads. | Send disabled while sending; idempotency key on forms and hand-off. |
| E13 | A listing photo file is missing → broken image → page looks broken. | Placeholder with alt text; one warning per photo per page view. |
| E14 | Phone Back button while full screen is open → leaves the listing. | The history step means Back closes the viewer first; Esc/Close go through the same path, so there is no race. |
| E15 | Page reloaded (or redeployed) while full screen is open → stale history step → an extra Back press needed. | On mount the step is cleared and the viewer starts closed. |
| E16 | Keyboard or screen-reader visitor → can't swipe → can't see photos. | Buttons, thumbnails, arrow keys, "N of M" labels, focus returns on close; swipe is never the only way (WCAG 2.5.7). |
| E17 | Listing has 1 photo, or a draft preview has 0 → empty controls. | 1: no controls; 0: placeholder. |
| E18 | Listing has many photos (e.g. 40) → slow page on phones. | Only photo 1 loads eagerly; thumbnails scroll in their own row. |
| E19 | Phone rotated on photo 5 → track lands between photos. | Snap re-aligns; the current photo is re-read from scroll position. |
| E20 | Blank alt text slips in → screen reader says nothing. | Fallback "Photo N of M, <address>". |
| E21 | Visitor prefers reduced motion → sliding causes discomfort. | Instant jumps. |
| E22 | Contact form and chat both open → two checks on one page → wrong token sent. | Unique widget ids; each token lives inside its own form. |
| E23 | Owner turns the assistant off mid-chat → visitor's next question. | Gets the hand-off form immediately; no model call. |
| E24 | Visitor problems inflate the dashboard count → owner alarmed. | Shown on their own line; the existing number is unchanged. |
| E25 | A manager saves contact details (an upsert) → could quietly switch the assistant off → visitors lose answers. | Trigger also guards inserts; pgTAP covers manager upsert. |
| E26 | listing-statuses branch lands first → conflict on the listing page. | Rebase, keep both, re-run e2e. |

## Gate 3: stack
Next 16.3.6, React 19.3.0, TypeScript 6.0.3, Tailwind 4.3.3, @marsidev/react-turnstile 1.6.1,
@anthropic-ai/sdk 0.128.0, @supabase/supabase-js 2.117.2, Zod 4.6.5, Vitest 5.0.2, Playwright 1.63.0,
Supabase CLI 2.118.0, Node ≥ 22 (package.json, 2026-10-02). No new dependencies.

## Changelog
rev 4 (final, audit grade A on all 8 criteria): trigger declared security invoker; A1 and E2 wording aligned. Critical test-key record decided from the server's own site-key setting (cannot be forged); forged dummy token = info; trigger bypass by explicit role, anon refused (pgTAP); E1 rewritten, E1b added.
rev 3: server-side test-key detection via the dummy token (spike rule dropped); public flag silences the browser report in CI/preview; slide button keeps the alt text and focus follows ←/→; visitor flood buckets split by severity; off-switch trigger guards inserts and allows service role, with pgTAP for manager upsert; E1 rewritten, E25 added.
rev 2: answered audit rev 1.
- **Turnstile:**
  - error-code → reason table;
  - browser test-key detection and a spike rule (E1 is no longer misfiled);
  - `ALLOW_TURNSTILE_TEST_KEYS` for preview and e2e;
  - 5 s timeout, retry once, ~10 s worst case.
- **Gallery:**
  - explicit focus model (no double-step, axe-safe);
  - history state machine, including reload;
  - 48 px thumbnails;
  - alt fallback;
  - thumbnail semantics fixed.
- **Chat:**
  - error mapping per the Claude API errors page (400 spend limit, persistent 429);
  - timeout left unchanged and measured in the smoke test;
  - spend ceiling via the Console;
  - off-switch storage fixed (`site_settings.is_assistant_on` with an owner-only trigger).
- **Logging:**
  - corrected flood description;
  - per-action visitor buckets, kept out of the server-critical pool;
  - no free text from visitors;
  - threat model;
  - pgTAP snapshot of existing origins;
  - dashboard task.
- **Scope:** dropped the `errors:check`/ESLint widening (follow-up); completed Level 1; resolved every fork with a default; narrowed Q9; cited Q10.

## Implementation notes (2026-10-02 build)

Where the build differs from the text above, and why:
- **Held send instead of a disabled Send button (§2.4).** Pressing Send while the Quick Check is still running shows "Running a quick check…", locks the fields, and sends automatically once the check passes, as in Addendum A §4. A button disabled with no explanation is worse for keyboard and screen-reader users, and nobody is refused for being quick.
- **One test-key flag (§2.1).** `NEXT_PUBLIC_ALLOW_TURNSTILE_TEST_KEYS` is read by both the server check and the browser report (it is written into both bundles at build time), instead of a separate server-only flag. It is set in `scripts/local-test-env.sh` and the CI browser job, and never on the live build.
- **Test-key detection (§2.1).** The critical `test_key_in_production` record comes from the server's own `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, or from a testing-key reply when the server holds the test secret. A dummy token a visitor sends is an ordinary `rejected` refusal.
- **Visitor browser codes (§1.4).** Existing code names are reused where they already meant the same thing (`script_error`, `network`, `timeout`, `stale_page`). New codes: `unsupported`, `test_site_key`, `missing_site_key`, `action_failed`, `image_failed`, `outdated_page_loop`.
- **Rate-limiter outages (§4.3)** are recorded under the action that hit them (`site.contact_form`, `site.booking_form`, `site.chat_handoff`, `site.chat_message`), once per running copy. The problem-report endpoint never records its own.
- **Old server actions (Addendum §2).** The admin `withCallReporting` is unchanged, and new tests pin its behaviour. A separate `withCallReportingFor` (member or visitor mode) wraps the public forms and the sign-in and reset forms.
- **Dashboard (§1.6).** "Serious" still means errors and worse, so an `outdated_page` warning shows in the 24-hour count, not the serious count. Website visitors' problems have their own line.
- **Off switch (§4.4).** It lives in `cwr.site_settings.is_assistant_on`. Its trigger reuses `cwr.is_service_context()` for the explicit role check.
- **`wrong_site` is a warning, not critical (§2.1 table).** A bot can reuse a token solved on another form, so it must not raise false alarms (the E1b principle). Setup problems decided from our own settings (`not_configured`, `test_key_in_production`) stay critical.
- **Visitor browser reports (§1.4)** are taken as a visitor's only from pages outside `/admin`. The endpoint never returns a reference code for them.
- **Later (2026-10-03):** the policy test run now runs in batches, so it stays within the Workers Free limit of 50 outside calls per request. The Chatbot policy page lists each question once, with its last result. Quoting public policy content is allowed, and "(private)" sections never reach the model. See `docs/cwr-chat-policy-test-batches-plan.md`.
- **Scroll lock (§3.2)** comes from the existing `html:has(dialog[open]) { overflow: hidden }` rule; the viewer adds no class of its own. It handles a close the browser forces by itself through the dialog's `close` event.
- **Status maps (Addendum 2b.4):** one `HAS_NOTICE` table in `form-state.ts` covers every status (`satisfies Record<RequestFormStatus, boolean>`), and each form's titles must cover exactly the notice statuses.
- **Test coverage notes:** the visitor side of the off switch (no model call while it's off) is covered by unit tests, since e2e runs without an API key. The production test-key browser report is unit-tested (`getSetupProblemCode`), because e2e builds opt in to test keys.
- **Not built** (out of scope, as planned): the forced-interactive (`3x…`) e2e case, which needs a different site key at build time and so is covered by unit tests; the live-model smoke test (owner task T2).
