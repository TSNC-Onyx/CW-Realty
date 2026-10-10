# False-alarm cleanup plan (2026-10-10)

## Goal
The problem log and the dashboard's "Problems — last 24 hours" card count only things that
actually went wrong, and the card's summary line says what they really were.

## Evidence (production, project egadvqpatnlkvgiiszzx)
- 160 of 216 recorded problems are `portal.page_not_found`. 60 of 60 admin saves since
  2026-10-03 produced one with the same request id. Next.js 16.3.6 builds the segment's
  `not-found` element into the tree on every render that reaches it
  (`node_modules/next/dist/server/app-render/create-component-tree.js:306,440`), and
  `app/admin/(portal)/not-found.tsx` records a problem while rendering.
- `chat_policy.finish_tests` / `run_tests`: 6 rows, each a finished test run with some
  failing questions ("6 of 47 tests failed").
- `auth.bot_check_widget` / `site.bot_check_widget` code `timeout`: 12 warnings. The text
  matches Turnstile's `timeout-callback` (a person was shown the tick box and didn't tick),
  which Turnstile already refreshes by itself (`refresh-timeout: auto`).
- `jobs.alert_email email_not_configured` (4) and `site.chat_assistant no_published_policy` (8):
  one row per visitor while a known setting is off.
- Zero error or critical rows exist; all health checks are currently fine.

## In scope
| # | Fix | Files |
|---|-----|-------|
| 1 | Stop the shared "not found" screen from recording. Record a miss only where it really happens: the unknown-address page (already does) and the item pages right before they call `notFound()`, with the real address. | `app/admin/(portal)/not-found.tsx`, `src/lib/admin/record-page-not-found.ts` (new `showItemNotFound`), the 9 admin pages that call `notFound()` (listings/[id], listings/[id]/preview, connections/[id], team/[id], homework/[id], inbox, inbox/[id], chats, chats/[id]) |
| 2 | Card line: when there are no errors, say "None were errors." Drop the "typing mistakes" guess. | `src/components/admin/dashboard/problems-card.tsx` |
| 3 | A finished test run with failing questions is a result, not a problem: keep the message on screen, stop recording it. Adds an "expected outcome" marker to the existing cause note. | `src/lib/observability/action-context.ts`, `src/lib/admin/report-action-failure.ts`, `src/lib/admin/chat-policy/actions.ts` |
| 4 | Quick Check: (a) Turnstile's "not ticked in time" goes back to waiting, with no report. (b) Our 10-second timer counts only while the tab is visible. (c) Turnstile errors: setup codes (1101xx, 110200, 4000xx) are reported at once; others only if a second error comes before any success (Turnstile retries by itself). (d) "Script didn't load" is not reported while the browser is offline. (e) "Browser can't run it" is info, not warning. | `src/components/forms/use-bot-check.ts` |
| 5 | Browser crash reports: "old code after a new release" (`ChunkLoadError`) and page-translator damage (`NotFoundError` removeChild/insertBefore) are info, not error. | `src/components/admin/problem-reporter.tsx`, `src/components/admin/use-reported-crash.ts`, `app/global-error.tsx` |
| 6 | One server crash during a save is recorded once, not twice: the browser report passes the server's digest so the two merge. | `src/lib/observability/call-server-action.ts` (and the copies in `src/components/admin/homework/use-homework-upload.ts`, `src/components/admin/chat-policy/policy-test-chat.tsx`) |
| 7 | A problem already recorded where it happened (`ReportedProblemError`) is not recorded again as a page crash. | `instrumentation.ts` |
| 8 | "Email not set up" and "assistant not set up" are recorded once per running copy of the site, not once per visitor (same pattern as `src/lib/security/visitor-bot-check.ts:24`). | `src/lib/jobs/enqueue-alert-job.ts`, `src/lib/chat/send-chat-message.ts` |
| 9 | Visitor-side failures while the visitor's own browser is offline (listing photo didn't load, form/chat call failed) are not reported. | `src/components/content/photo-gallery.tsx`, `src/lib/observability/call-server-action.ts` (visitor mode) |
| 10 | Database health check: a good write right after a failed one clears the "failing" state, so the watchdog can't keep raising a recovered problem every 15 minutes. **Needs a production database update (owner approval).** | new `supabase/migrations/20261010000100_cwr_health_check_recovery.sql` (replaces `cwr.touch_health_check`) |

## Out of scope (left as is, with reason)
- Sign-in mistakes, expired email links, and "refused" messages people see: real events the
  owner rule (2026-09-27) says must be logged.
- A database outage recorded by both the menu and the page: a real problem, counted twice;
  separate change.
- How often the watchdog repeats a real ongoing problem.
- Homework "URL safety check" row: caused by the content policy fixed in PR #35 (2026-10-09).
- No new dashboard counts, filters, or pages; no change to alert emails (paused).

## Assumptions
- Next.js 16.3.6, React 19, Vitest, Playwright, @marsidev/react-turnstile 1.6.1 (confirmed in package.json).
- Item pages know their own address; the unknown-address page is unchanged.
- Visitors never see reference codes for the two "not set up" notes (checked before build; if
  a caller shows the reference, it keeps the first one).

## DO NOT TOUCH
- `supabase/migrations/*` already applied (new migration only), `cwr.record_problem`, catalog actions.
- `app/admin/problems/report/route.ts`, rate limits, scrubbing, alert sender, cron settings.
- Public `(site)` not-found and catch-all pages; admin layout and sign-in flow.
- Messages people see (wording on screen) except the dashboard card line.

## Downstream impact analysis
### Level 1 — Direct
Files in the table above. Contracts: `recordPageNotFound`, `ProblemCause` (adds optional
`isExpected`), `getReportedFailureMessage`, Quick Check status transitions, `onRequestError`,
`touch_health_check`.
### Level 2 — Dependent
- Every admin action passes through `getReportedFailureMessage`; the new marker is opt-in, so
  nothing changes unless a caller sets it. Risk: low.
- Every Quick Check form (sign-in, password, request forms, chat) uses `use-bot-check`. Status
  changes must keep submit-holding and retry working. Risk: requires plan entry (tests below).
- `enqueueAlertJob` callers read `reference` on `not_set_up`. Risk: low (checked before build).
- `record_problem` calls `touch_health_check`. Risk: low.
### Level 3 — Cascading
- Dashboard counts and the Problems log drop by the removed false alarms — intended.
- Spike rules (`invalid_credentials`, `mfa_verification_failed`) unaffected.
- Production database: one function replaced. **Requires human approval.**

## Tests
- Unit: card wording; `showItemNotFound` records once with path; expected-outcome cause skips
  recording; Quick Check timeout/visibility/error-code/offline paths; crash severity
  classification; digest passed; `onRequestError` skips `ReportedProblemError`; once-per-copy notes.
- SQL test (local Supabase): error then quick success clears failing state.
- Full `npm run lint`, `typecheck`, `test`, `test:e2e`; local DB reset + real content import afterwards.
- After deploy: save a listing and confirm no new `page_not_found` row.

## Implementation notes (2026-10-10)
- Owner approved the plan and the production database update on 2026-10-10.
- #7 changed during the build: problem rows can't be edited (append-only), so skipping the
  second record would let the crash screen record its own copy. Instead the server writes an
  info note (`already_recorded`) whose detail names the original reference; the crash screen
  finds that note by digest. One outage now counts as one error.
- #4 after review: the 10-second limit runs only while the tab is in view (it restarts in full
  when the tab comes back); a first harmless widget error restarts the full window so
  Cloudflare's own retry (every 8 s) can land; "not ticked in time" keeps showing the tick box.
- #8 uses a shared helper, `src/lib/observability/once-per-copy.ts`, for the chat note; the
  email note caches its first reference so callers keep showing a reference.
- #10 applied to production 2026-10-10 (version 20261010000100 recorded in schema_migrations).
- Verified: 941 unit tests, 285 database tests, 446 browser tests passed; the new save test
  fails when the old "not found" screen is restored. One existing browser test ("turn the chat
  assistant off and back on") is flaky when runs overlap with chat-policy.spec.ts; unrelated.
