# Phase 4 — Inbox & Notifications — Plan

Status: **built** (2026-09-25) on branch `phase-4-inbox-notifications` (stacked on `phase-3-admin-portal`).
Parent plan: `docs/cwr-website-build-plan.md` (Phase 4, tasks 15–16).

## Goal

Contact and CWR TouchUp requests land in an admin inbox that staff can filter, assign, note, and answer by email, while chosen recipients get an email alert for every new request — delivered through a retrying background queue whose failures are visible and retryable.

## Scope

**In scope**
- Task 15: public form intake (Contact, TouchUp booking; chat handoff arrives in Phase 5 through the same intake) → `cwr.inbox_threads` + first message, atomically; bot protection; visitor confirmation email; success screen (Style §11.12). Admin inbox: filters (new / assigned / replied / closed), assign, internal notes, reply by email, full thread history, unread count on the dashboard and in the menu.
- Task 16: alert recipients (who gets which kind of alert), "Send test alert", delivery log with failures and Retry; Cloudflare Queue with retries and a dead-letter queue.
- Bot protection (Cloudflare Turnstile) on the public forms and the admin sign-in / reset forms (moved here from Phase 3).

**Out of scope**
- Reading visitors' email replies back into the inbox (inbound email parsing). Replies are sent with Reply-To set to the main CWR email, so answers reach the office mailbox. Revisit if the owner wants two-way threads.
- Text-message alerts (email only; Admin §5 asks for "alerts", MailerSend is the approved channel).
- Chat assistant (Phase 5).

## Resolved decisions

| # | Question | Decision | Source |
|---|---|---|---|
| 1 | Email provider | MailerSend REST API (owner-approved), called with `fetch`; secret `MAILERSEND_API_KEY` | Parent plan, owner approval #2 |
| 2 | Sending address | A subdomain, e.g. `alerts@notify.charliewardrealty.com`, so its SPF/DKIM records are separate and the Google Workspace MX/SPF/DKIM records stay untouched | Parent plan DO NOT TOUCH |
| 3 | Background work | Cloudflare Queue `cwr-alerts` (max 5 retries, backoff) with dead-letter queue `cwr-alerts-dlq`; a custom Worker entry adds the queue handlers to the OpenNext app. Where no queue exists (local `next start`, CI), the same job runs right away in the request | Infra §3, §6; parent plan architecture |
| 4 | Without an email key | Local/CI: nothing is sent; each would-be email is logged as "not sent — email not set up" in the delivery log, and the Notifications page says so | Infra §3 fail gracefully |
| 5 | Bot protection | Cloudflare Turnstile widget (`@marsidev/react-turnstile` 1.6.1) + server-side verification; Supabase Auth's built-in Turnstile check for sign-in and password reset. CI and local use Cloudflare's official always-pass test keys | Infra §2 |
| 6 | Atomic intake | New `cwr.create_inbox_thread()` (service role only) writes the thread and first message in one transaction; the form's idempotency key prevents duplicates | Infra §3 |
| 7 | Unread | "New" threads for owners/managers; assigned-to-me threads still "assigned" for staff | Admin §5 |
| 8 | Reply channel | Reply is written to the thread, then emailed through the queue; status moves to "replied" through the workflow engine | Admin §5, Infra §4 |
| 9 | Promised reply time | "within one business day" in the visitor message and email — owner can change the wording | Features §2 (tell visitors when to expect a reply) |
| 10 | Delivery log retention | One year, purged with closed conversations | Parent plan retention |

## Architecture context

- Public forms → server action → Turnstile check → `create_inbox_thread` (service role) → enqueue `new-request` job.
- Queue consumer (or inline fallback) → loads thread + recipients → MailerSend → `cwr.alert_deliveries` row (sent / failed / not sent). After the last retry the dead-letter consumer marks the delivery failed so the admin sees it.
- Admin inbox uses the session client (RLS: staff see only assigned threads).

## Task breakdown

1. Migration `20260925001400_cwr_inbox_intake_and_deliveries.sql`: `cwr.alert_deliveries` (+ RLS: editors read), `cwr.create_inbox_thread()`, retention of deliveries. pgTAP `100-inbox-intake.test.sql`.
2. Email: `src/lib/email/mailersend.ts`, `src/lib/email/messages.ts` (alert, visitor copy, reply, test), `src/lib/email/send-email.ts`.
3. Jobs: `src/lib/jobs/alert-jobs.ts` (job types, enqueue with inline fallback), `src/lib/jobs/process-alert-job.ts`; `worker.ts` custom Worker entry; `wrangler.jsonc` queue producer/consumers.
4. Turnstile: `src/components/forms/turnstile-field.tsx`, `src/lib/security/turnstile.ts`; CSP adds `https://challenges.cloudflare.com` to script/frame/connect sources.
5. Intake: `submit-actions.ts` creates threads; success screen; form idempotency key.
6. Admin inbox: `/admin/inbox` (filters, pagination), `/admin/inbox/[id]` (history, notes, assign, status, reply); dashboard card + unread count; nav.
7. Notifications: `/admin/notifications` (recipients, test alert, delivery log with Retry).
8. Sign-in captcha: login + forgot-password pass the Turnstile token to Supabase Auth; `config.toml` `[auth.captcha]`.
9. Tests: unit (email building, job processing, Turnstile verify, schemas), pgTAP, Playwright (submit → inbox → assign → note → reply → close; staff visibility; notifications; test alert; bot check failure).

## Assumptions

- The owner creates the MailerSend account, verifies the `notify.` subdomain (DNS records added at launch with the domain decision), and adds `MAILERSEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and the two queues before the first production deploy (runbook, Phase 7).
- Cloudflare Queues are available on the account's Workers plan.

## DO NOT TOUCH

Parent-plan list (incl. Google Workspace MX/SPF/DKIM); migrations up to `20260925001300`; pgTAP `000`–`090`.

## Edge cases (most → least critical) and solutions

| # | Edge case | Solution |
|---|---|---|
| 1 | Email provider down → alerts silently lost | Queue retries 5 times with backoff; then the dead-letter handler marks it failed; Notifications shows failures with Retry |
| 2 | Bots flood the forms | Turnstile checked on the server for every submission; tokens are single-use |
| 3 | Visitor double-submits | Idempotency key per form attempt → one thread |
| 4 | Staff sees other people's messages | RLS limits staff to assigned threads; every action re-checks through RLS |
| 5 | Reply to a visitor who left only a phone | Reply by email is disabled with "Call or text (336) …" instead |
| 6 | Header injection through names/subjects | Emails built as JSON for the API (no raw headers); names stripped of line breaks |
| 7 | Queue missing in an environment | Job runs in the request instead; nothing is lost |
| 8 | Recipient list empty | New requests still land in the inbox; Notifications warns "Nobody gets alerts" |
| 9 | Very long message | 5,000-character limit on the form; the database allows up to 20,000 |

## Downstream Impact Analysis

### Level 1 — Direct
New migration, email/jobs/security modules, `worker.ts`, `wrangler.jsonc`, public forms, admin inbox and notifications pages, dashboard, sign-in forms, CSP, `config.toml`.

### Level 2 — Dependent
- CSP change on public pages (Turnstile). Risk: low; limited to Cloudflare's challenge host.
- `wrangler.jsonc` queue bindings: `wrangler deploy` / preview uploads fail until the queues exist in the Cloudflare account. Risk: **requires plan entry** — runbook step before enabling previews/deploys.
- Supabase Auth captcha: sign-in fails if the hosted project enables captcha without the site sending tokens (and vice versa). Risk: requires runbook ordering.

### Level 3 — Cascading
- DNS: the `notify.` subdomain records for MailerSend are added at launch with the domain decision (parent plan item 4). No change to Google Workspace records.
- Phase 5 chat handoff uses `create_inbox_thread` with source `chat_handoff`.

## Launch notes (for the Phase 7 runbook)

- Cloudflare: create queues `cwr-alerts` and `cwr-alerts-dlq` **before** enabling preview uploads or deploying (the Worker config references them). Add a rate-limiting rule for form posts.
- Worker secrets: `MAILERSEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; Worker variables: `ALERT_FROM_EMAIL` (e.g. `alerts@notify.charliewardrealty.com`), `ALERT_FROM_NAME`. Build variable: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- MailerSend: verify the `notify.` subdomain (its own SPF/DKIM records — the Google Workspace records stay untouched). Configure the same SMTP in Supabase Auth for invite and reset emails.
- Supabase Auth: turn on Turnstile captcha with the same secret at the same time the site starts sending tokens.
- Local testing: `npm run db:start`, then `source scripts/local-test-env.sh`.

## Verification (2026-09-25)

| Check | Result |
|---|---|
| Unit tests | 156 passed |
| Database tests (fresh database) | 111 passed (11 files, incl. new `100-inbox-intake`) |
| Playwright, CI setup | 220 passed — incl. public request → success screen → inbox → assign → note → reply, staff visibility, unread count, recipients + test alert + delivery log |
| lint, typecheck, db:check, db:lint, design:check, Workers build + `wrangler deploy --dry-run` (queue binding) | pass |
| Independent review | 2 high (database errors could drop alerts; test alerts re-sent on retry), 3 medium (queue hand-off failure, visitor copy usable as an email relay, duplicate-send races), 2 low (Turnstile site/form check, staff could edit contact details, PII in logs) — all fixed; follow-up found 2 more (stuck "sending" claim, rate-limiter error) — fixed and confirmed |
