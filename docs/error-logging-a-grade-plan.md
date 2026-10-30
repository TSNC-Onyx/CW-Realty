# Error logging A-grade plan (2026-10-10)

## Goal
Problems are kept through a database outage, crashes and browser errors are caught on the
public website as well as the admin, every stack trace can be read back to the real file and
line, and repeated problems are grouped by what actually went wrong and shown to the owner on
a Problems page.

## Audit this plan answers (2026-10-10)
| # | Question | Before | Target |
|---|----------|--------|--------|
| 1 | Logs when Supabase is down or slow | C: server log only (3 days), no retry | A |
| 2 | Catches uncaught exceptions | C+: admin only | A |
| 3 | Browser errors captured | C+: admin only, 5 visitor features | A |
| 4 | Stack traces readable | D: minified, 5 frames, numbers scrubbed, server frames dropped | A |
| 5 | Repeats grouped and deduplicated | B: grouped by action/code only; no Problems page | A |
| 6 | Someone alerted | F | **Out of scope (owner, 2026-10-10): no paid Cloudflare plan.** |

## Facts checked before planning
- Cloudflare Queues are on the Workers Free plan: 10,000 operations a day, messages kept 24 h
  (developers.cloudflare.com/queues/platform/pricing). The site already has queue `cwr-alerts`
  with retries and a dead-letter queue (`wrangler.jsonc`).
- Workers Free: 10 ms CPU per request, 3-day log retention, 64 MiB uncompressed size limit
  (developers.cloudflare.com/workers/platform/limits, …/observability/logs/workers-logs).
- Cloudflare does not decode stack traces at runtime; only live logs and Tail Workers are
  decoded (developers.cloudflare.com/workers/observability/source-maps).
- Built code is minified on both sides (measured: `fetchAdminListing` is called through `g`).
  Next writes server maps beside each server chunk (`.next/server/**/*.js.map`); browser maps
  need `productionBrowserSourceMaps`, and Next then serves them publicly unless removed
  (nextjs.org/docs/app/api-reference/config/next-config-js/productionBrowserSourceMaps).
- The deployed Worker is one esbuild bundle; `wrangler deploy --dry-run --outdir` writes the
  same bundle with `worker.js.map` (measured: 16 MB bundle, 23 MB map).
- Production deploys through Cloudflare Workers Builds from `build1` (not `deploy.yml`, which
  targets `main`). Workers Builds sets `WORKERS_CI_COMMIT_SHA` and allows build-only secrets.
- The privacy policy already covers "basic technical details … to keep the site secure and
  working" (`app/(site)/privacy-policy/page.tsx:44`).

## Phase A — keep problems through a database outage (Q1)
1. When writing a problem fails or times out, hand it to the existing `cwr-alerts` queue as a
   new job kind `record_problem` (same id, so a write that did land isn't counted twice:
   `insert_problem_event` already returns the stored row for a known id).
   Files: `src/lib/observability/record-problem.ts`, `src/lib/jobs/alert-jobs.ts`,
   `src/lib/jobs/process-alert-job.ts`, `worker.ts`.
2. The consumer retries with growing waits (1 min, 5 min, 30 min, 2 h, 12 h), inside the
   queue's 24-hour limit; after the last try the dead-letter consumer writes a log line.
3. Only warnings and worse are retried (notes stay in the server log), with a budget of 300
   retry messages per running copy per day (each costs about 10 queue operations; revised
   from 2,000 after review, which would have exceeded the free 10,000 a day). Over budget → server log only. If the queue is
   ever full, alert emails already fall back to sending right away (`enqueueAlertJob`).
4. On recovery the first good write clears the "problem log failing" check (done in PR #39).

## Phase B — public website coverage (Q2, Q3)
5. Server crashes on public pages are recorded as `site.page_crash` (visitor origin, no person,
   page path only). File: `instrumentation.ts`, `src/lib/observability/crash-cause.ts`.
6. Public crash screens (`app/(site)/error.tsx`, `app/global-error.tsx` for public pages)
   report the crash with its digest, so it joins the server record instead of a copy.
7. A visitor version of the admin's error watcher on public pages (`site.browser_error`):
   uncaught errors and rejected promises, once per error per visit, notes for errors from
   extensions or old code (reuses `browser-noise.ts`).
   Files: new `src/components/content/visitor-problem-reporter.tsx`, `app/(site)/layout.tsx`.
8. Visitor reports may carry **stack frames only** (the server keeps only lines that look like
   `at name (file:line:col)` from our own code); the error message is still dropped, as now.
   Files: `app/admin/problems/report/route.ts`, `src/lib/observability/problem-report-rules.ts`.
9. Catalog: add `site.page_crash` and `site.browser_error`.
   Files: `src/lib/observability/problem-catalog.ts`, new migration adding the catalog rows.

## Phase C — readable stack traces (Q4)
10. Keep the trace usable: up to 10 frames; drop only browser-extension and runtime-internal
    lines; never scrub the `file:line:col` part (the privacy rules still run on the message).
    File: `src/lib/observability/scrub.ts`.
11. Every report carries the release it came from: the commit id baked in at build
    (`WORKERS_CI_COMMIT_SHA`), sent by the browser with its own build's id, so an old open
    tab is matched to its own code. Files: `next.config.ts`, `report-client-problem.ts`,
    `report-problem.ts`, `worker.ts`.
12. Source maps kept private: the build makes browser maps, then a release step uploads the
    browser maps, server chunk maps and the Worker bundle map (gzip) to a **private** Supabase
    Storage bucket `source-maps/<commit>/`, deletes the browser maps so they are never served,
    and keeps only the last 15 releases. New: `scripts/store-source-maps.mjs`,
    `package.json` `release:deploy`, migration for the private bucket (no public or
    signed-in access; service role only).
13. A trace reader: `npm run problem:trace -- CWR-XXX-XXX` reads the problem, fetches that
    release's maps, and prints each frame as `src/…/file.ts:line function`. Uses the
    `source-map` package (Mozilla; buy, not build). New: `scripts/trace-problem.mjs`.
13b. Readable on the Problems page: the group detail has "Show the code location". It asks the
    server for a short-lived private link to that release's maps (owners only) and decodes the
    frames in the owner's browser (the `source-map` package loaded only on that click), so the
    site's 10 ms CPU limit is never involved. Files: `src/components/admin/problems/trace-view.tsx`,
    `src/lib/admin/problems/actions.ts`.
14. **Owner step (Cloudflare dashboard, about 5 minutes, written as a runbook):** set the
    Workers Builds deploy command to `npm run release:deploy` and add two build-only secrets
    (Supabase URL and service key). Without them the release still deploys; maps are skipped
    and a build warning says so.

## Phase D — grouping and the Problems page (Q5)
15. Crashes and browser errors are grouped by what went wrong, not only by action and type:
    the error name, its first message line with numbers, ids, hashes and quoted text removed,
    and the top own-code frame's file and function. Other stages keep today's grouping.
    Files: new `src/lib/observability/group-key.ts`; migration replacing
    `cwr.get_normalized_problem` to include the key in the fingerprint.
16. Problems page for owners (design from `docs/cwr-error-tracking-plan.md` "Problems page",
    deferred 2026-09-27): list of groups (severity, section, label, latest message, count,
    first/last seen, status), filters (section, severity, open/resolved, 24 h/7 d/30 d/all),
    search by reference or request id, group detail with occurrences, "Mark resolved" with a
    note (`cwr.resolve_problem_group`, owners only, via `cwr.transition`).
    Files: `app/admin/(portal)/problems/*`, `src/lib/admin/problems/*`,
    `src/components/admin/problems/*`, owners-only menu entry, migration for the function.
17. Dashboard card adds "in N groups" and links to the Problems page.

## Out of scope
- Alerts (Q6): owner decision 2026-10-10. Free route for later, if wanted: a database
  schedule (`pg_cron` + `pg_net`) could send the existing problem digest without a
  Cloudflare cron.
- External uptime monitor (D6): it alerts, so it waits with Q6.
- Changing what visitors see on any page; resolving traces automatically inside the site
  (10 ms CPU limit).

## Assumptions
- Next.js 16.3.6 (Turbopack), React 19.3, OpenNext Cloudflare, wrangler from `package.json`;
  Supabase free tier (1 GB storage: 15 releases of gzipped maps ≈ 300 MB).
- The owner can edit the Workers Builds settings (step 14).
- esbuild gives the same bundle for the same input, so the dry-run map matches the deploy.

## DO NOT TOUCH
- Already-applied migrations (new migrations only); flood limits, scrub rules for messages,
  rate limits, alert sender and its pause; problem email settings.
- Visitor-facing wording and layout; the cookie banner and tracking; sign-in flow.
- `deploy.yml` (unused path to `main`).

## Downstream impact analysis
### Level 1 — Direct
`record-problem.ts`, queue job types and consumer, `instrumentation.ts`, report route and
rules, `scrub.ts`, catalog, site layout and error screens, build scripts, new Problems page,
`get_normalized_problem`.
### Level 2 — Dependent
- Every problem write passes through `recordProblem`: the queue hand-off only runs on failure.
  Risk: low; unit tests for success, failure, timeout, queue missing.
- The alert-email queue shares the consumer: job kinds are separate, and the daily budget
  protects email operations. Risk: requires plan entry (done above).
- Changing the fingerprint starts new groups for crashes; old groups stay as they are.
  Risk: low.
- Report route accepts a new visitor field (frames). Risk: **security-sensitive** (privacy of
  visitor data) → owner approval.
### Level 3 — Cascading
- Build and deploy pipeline (step 12, 14): a failed upload must never block a release.
  Risk: **requires owner approval** (service key as a build secret; new private bucket).
- Supabase storage use grows; capped at 15 releases.
- Dashboard numbers include public-site problems (already on their own "Website visitors"
  line, so the team's figure keeps its meaning).

## Edge cases (most to least critical) — see the owner summary for the plain table
1. Database down for longer than the retries (over about 15 hours).
2. Retry messages use up the queue allowance and block alert emails.
3. A retried problem is stored twice.
4. Private source maps leak publicly.
5. A visitor's personal data ends up in a stack trace.
6. A broken script on the public site floods the log.
7. The map upload fails during a release.
8. An old open tab reports an error against new code.
9. The new grouping splits one bug into many groups, or merges two.
10. Storage fills up with old maps.

## Audit of this plan (graded A after one revision)
Sources: OWASP Logging Cheat Sheet (logging failures must not stop the app; client data is
untrusted; never log personal data; include the application version), OWASP Top 10 2025
A09, Google SRE "Monitoring Distributed Systems", Sentry source-map guidance (upload maps
privately at build, don't serve them), Cloudflare and Next.js docs listed above.
- Revision 1 → 2: traces were readable only through a script (not for the owner) → added 13b;
  retrying every note during an outage could waste the free queue allowance → warnings and
  worse only. Rejected along the way: serving maps publicly (leaks source), turning off
  minification (bigger and slower site), decoding inside the site (10 ms CPU limit).

## Tests
- Unit: queue hand-off on failure/timeout only; budget; idempotent retry; crash cause for
  public pages; visitor frames-only filter; scrub keeps `line:col`; release id on reports;
  group key normalisation; Problems page queries; trace decoding of a known minified frame.
- Database (pgTAP): new catalog rows; private bucket blocks anon and signed-in reads;
  `resolve_problem_group` owners only; fingerprint uses the group key.
- Browser (Playwright): a public page crash is recorded once with its digest; a public
  uncaught error is recorded as a note or error; Problems page list, search, detail,
  resolve; manager can't open it.
- Release: dry run of `release:deploy` locally — maps uploaded, no `.map` in
  `.open-next/assets`, `problem:trace` prints real file names for a test error.
- Full lint, typecheck, unit, database and browser suites; local DB reset + real content after.

## Implementation notes (2026-10-10)
- Owner approved the plan and all three items (visitor code locations, private source-map
  bucket with the service key as a build secret, the Cloudflare dashboard step).
- **Server traces needed one more step (owner approved 2026-10-10):** OpenNext folds every
  server chunk into `handler.mjs` without a map, so the Worker map stopped there.
  `scripts/patch-opennext-sourcemap.mjs` adds `sourcemap: true` to that one esbuild call; it
  runs on every install and at the start of `release:build`, and stops the build with a clear
  message if an OpenNext upgrade changes the file. (Turning off server minification was tried
  first; Turbopack ignores `experimental.serverMinification`.)
- The hook is the Workers Builds **build** command (`npm run release:build`); the Worker map
  comes from `wrangler deploy --dry-run`, which was checked to produce the identical bundle.
- Browser maps are moved out of `.next/static` by an npm `postbuild` step after every build,
  so they can't be published even before the dashboard step is done; Turbopack names maps
  differently from scripts, so each script's `sourceMappingURL` line is followed.
- The `source-maps` bucket is created by `supabase/config.toml` locally and by
  `scripts/store-source-maps.mjs` in production (project rule: migrations don't write to
  `storage`).
- Grouping uses only the cleaned first message line; stack lines were left out because built
  code's names change every release.
- Verified end to end: a recorded trace with one server and one browser frame read back to
  `src/lib/admin/listings/queries.ts:60` and `src/components/admin/problems/trace-view.tsx:66`,
  both by `npm run problem:trace` and by "Show the code location" in the browser.
