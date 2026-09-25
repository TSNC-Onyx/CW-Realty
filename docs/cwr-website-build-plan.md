# CWR Website Build — Plan

Status: **approved for implementation** (owner, 2026-09-25) — see Owner approvals. Phase 0 (foundation) is built on branch `build1`; Phases 1–7 not started.

## Goal

A new charliewardrealty.com — public site, AI chat assistant, and a manager-run admin portal — built on its own isolated database area, meeting all four constitutions in `docs/constitution/`.

## Governing documents (read first)

| Doc | Governs |
|---|---|
| `docs/constitution/01-infrastructure.md` | Workflow, security, reliability, audit, performance, scale, observability |
| `docs/constitution/02-style-ui-ux.md` | Brand, accessibility, layout, navigation, forms, motion, content |
| `docs/constitution/03-features-navigation.md` | Mobile nav, chatbot, ads/analytics, privacy/consent |
| `docs/constitution/04-admin-control-system.md` | Admin editing, listings, team, contact/footer, inbox, chatbot policy, access |
| `docs/reference/site/navigation-reconciliation.md` | Final page list, menu, redirects, owner decisions |
| `docs/reference/brand/CWR-Image-Refresh.png` | Logo; brand gold `#E6BD35` |
| `docs/reference/design/modern-editorial/` | Frozen Theme C reference screens and explanations (Style §11 wins on any difference) |

## Current state (verified 2026-09-25)

- Repo: `TSNC-Onyx/CW-Realty` (**public**); docs and Phase 0 code on `build1`.
- Domain: DNS hosted at Wix (`ns6/ns7.wixdns.net`); email on Google Workspace (MX `aspmx.l.google.com`).
- Supabase `egadvqpatnlkvgiiszzx` (Postgres 17, us-east-2): legacy property-management schema in `public` with demo data; no versioned migrations; 4 tables with RLS off (`app_settings`, `chat_leads`, `chat_rate_limits`, `ref_counters`); 1 storage bucket, 0 files.
- Local tooling: Node 25.9, npm 11.12, gh 2.92; Supabase CLI pinned in `package.json` (run via `npx supabase`); local Supabase uses ports 553xx because another project holds the defaults.

## Architecture

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16.3 (App Router, React 19.3), TypeScript | Server rendering by default, streaming, minimal client JS (Infra §5) |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare` 1.20 | Edge caching, preview URL per PR, versioned instant rollback (<5 min), stateless horizontal scale |
| Database | Supabase, new schema **`cwr`**; legacy `public` untouched | Explicit segregation from existing data |
| DB access | `@supabase/supabase-js` 2.117 + `@supabase/ssr` 0.12 over HTTP (built-in pooling) | Connection pooling requirement; service-role key server-only |
| Auth | Supabase Auth, email + password + TOTP MFA required for every admin role | Infra §2, Admin §7 |
| Validation | Zod 4 schemas shared by forms and server actions | Infra §2 "shared schemas" |
| Styling | Tailwind CSS 4 with design tokens, self-hosted variable fonts; owner-chosen theme **Modern Editorial**, fully specified in `docs/constitution/02-style-ui-ux.md` §11 | Style §1, §11 |
| Images | Supabase Storage; resized to AVIF/WebP on upload with width/height stored | Style §3, §8 |
| Chatbot | Claude API (`@anthropic-ai/sdk`), server-side only; first-party widget (no third-party script) | Features §2, CSP |
| Background work | Cloudflare Queues with retry + dead-letter queue | Infra §3, §6 |
| Email (alerts, inbox replies) | MailerSend (owner choice) sending from the CWR domain | Admin §5 |
| Bot/abuse protection | Cloudflare Turnstile + rate-limit rules on every public endpoint | Infra §2 |
| Analytics | GTM (web + server-side container), GA4, Meta Pixel + Conversions API, Google Enhanced Conversions; Consent Mode v2 banner honoring GPC | Features §3, §4 |
| Observability | Cloudflare Workers Observability (errors, logs, OpenTelemetry traces with request ID), Cloudflare Web Analytics (real-user Core Web Vitals), hosted status page — no Sentry (owner decision) | Infra §7 |
| CI | GitHub Actions: lint, type check, unit tests, migration check, Playwright + axe accessibility, Lighthouse budgets, dependency scan, secret scan | Infra §1, §6 |
| Property Search | Placeholder page; MLS embed added later in a sandboxed, lazy-loaded frame | Owner decision |

### Data model (schema `cwr`, every table has `tenant_id` + RLS)

| Table | Purpose |
|---|---|
| `tenants`, `memberships` | One CWR tenant; user ↔ role (`owner`, `manager`, `staff`) |
| `site_settings` | Phone, email, contact names, footer text — edited once, used everywhere |
| `listings`, `listing_photos` | Featured properties: status (`active`/`pending`/`sold`), publish state (`draft`/`live`), order, photos with required alt text |
| `team_members` | Profile pages, order, visibility (hidden keeps the page) |
| `redirects` | Legacy map + automatic redirects on slug change/removal |
| `inbox_threads`, `inbox_messages` | Contact form, chat handoffs, TouchUp booking requests; status (`new`/`assigned`/`replied`/`closed`), assignee, internal notes, replies |
| `notification_recipients` | Who gets contact / chat / booking alerts |
| `chat_policies`, `chat_policy_tests`, `chat_policy_test_runs` | Versioned policy file, preset test questions, pass/fail gate for publishing |
| `chat_sessions`, `chat_messages` | Logged chats for weekly review |
| `workflows`, `workflow_transitions` + `cwr.transition()` | The only path for any status change; every transition audited |
| `audit_log` | Append-only: who, what, when, tenant, before/after (triggers on every table) |
| `idempotency_keys` | Retry-safe mutations |
| `trash` view (via `deleted_at`) | 30-day soft delete, then scheduled purge |

### Role access

| Area | Owner | Manager | Staff |
|---|---|---|---|
| Listings, Team, Contact & Footer | Edit | Edit | — |
| Inbox | All | All | Assigned to them |
| Notifications | Edit | Edit | — |
| Chatbot policy | Edit | — | — |
| Users & roles, Trash restore/purge | Yes | Restore only | — |

### Retention (Infra §4)

Audit log 3 years (matches NC Real Estate Commission record rule); chat transcripts and inbox threads 1 year after close; trash 30 days. Enforced by scheduled jobs.

## Task breakdown

Each phase is one or more small PRs to `main`, each with a preview URL.

**Phase 0 — Foundation**
1. Scaffold Next.js app at repo root (`package.json`, `app/`, `src/`, `wrangler.jsonc`, `open-next.config.ts`); `.env.example` only — no secrets in git.
2. `supabase/` project folder with `config.toml` exposing schema `cwr`; migrations in `supabase/migrations/`.
3. Migrations: schema `cwr`, tables above, RLS policies, audit triggers, workflow engine, retention jobs.
4. RLS tests per role (`supabase/tests/`, pgTAP) run in CI.
5. GitHub Actions workflows in `.github/workflows/`.
6. Security headers + strict CSP in `middleware.ts`; request ID propagation; Workers Observability.

**Phase 1 — Public shell**
7. Design tokens (Style §11), fonts, layout, header (60px mobile / 88px desktop, sticky), mobile menu (focus trap, Escape), skip link, footer, Call/Text/Chat bar.
8. Redirect middleware reading `cwr.redirects` (single hop, normalization rules); hidden team members 302 to `/team` via `cwr.is_hidden_team_member()`; 404 page.
9. Static pages: Home, About, Contact (form), Privacy Policy, Resources (FAQs & Homework), Connections, CWR TouchUp (booking request form), Property Search placeholder.

**Phase 2 — Data-driven pages**
10. Listings index + detail pages; Team index + profile pages; generated `sitemap.xml` and `robots.txt`.
11. Seed: 4 listings, 10 team members, legacy redirects, site settings (content pulled from the current live site for owner review).

**Phase 3 — Admin portal (`/admin`, noindex)**
12. Login + MFA enrollment, inactivity timeout, role gating.
13. Dashboard cards; Listings, Team, Contact & Footer editors (fixed Save, toasts, unsaved-changes guard, preview, undo, trash).
14. Image upload pipeline (resize, formats, alt text required).

**Phase 4 — Inbox & notifications**
15. Contact / booking / chat-handoff intake → inbox; filters, assign, notes, reply by email, thread history, unread count.
16. Alert recipients + test alert; queue with retry and dead-letter visibility.

**Phase 5 — Chatbot**
17. Chat widget (loads after content, labeled AI, "talk to a person").
18. Server endpoint: policy-grounded answers with section citations, injection defenses, no restricted data collection, handoff to inbox.
19. Policy editor (owner-only): versions, restore, live test chat, publish gated on passing test run.

**Phase 6 — Analytics & consent**
20. Consent banner (accept/reject, GPC, Consent Mode v2); GTM web + server container; Pixel/CAPI dedupe; key events; offline-conversion export.
21. Privacy policy lists every tracker and chat data use.

**Phase 7 — Launch**
22. Performance budgets, load test, keyboard + screen-reader pass, device matrix (320/375/768/1440).
23. SLOs, alerts, runbooks (`docs/runbooks/`), status page, restore test.
24. Connect the domain (method undetermined — see Owner approvals item 4); Google Workspace mail records must be preserved either way.

## Assumptions

- Single business (one tenant); `tenant_id` kept for isolation and future growth.
- The legacy `public` schema is not used by the new site and is never modified by this build.
- Legacy demo property data is not imported.
- Content (listing details, bios, photos) is pulled from the current live Wix site as a starting point and corrected by the manager in the admin portal.
- Replies from the inbox go out by email; Call/Text buttons use the phone's own dialer and messaging app.
- TouchUp "booking" is a request form (preferred dates/times) confirmed by staff, not a live calendar.
- Every admin account (all three roles) must use MFA.
- The chatbot policy file lives in the database, never in this public repo.
- Hosted database changes are applied only by `supabase db push` in the Deploy workflow — never via the Supabase MCP `apply_migration`, which records different version numbers and breaks later pushes.

## Owner approvals (2026-09-25)

| # | Item | Decision |
|---|---|---|
| 1 | Architecture (Next.js on Cloudflare, schema `cwr`) | Approved |
| 2 | External services | Approved: Cloudflare, Anthropic (Claude), MailerSend. Declined: Resend, Sentry. Not yet confirmed: Google (GA4/GTM/Ads), Meta, status-page provider — required by the constitutions; confirm before Phase 6/7 |
| 3 | RLS lockdown of legacy tables `app_settings`, `chat_leads`, `chat_rate_limits`, `ref_counters` | Declined — left as-is; open security risk owned by the owner (anyone with the public key can read/write them) |
| 4 | Domain connection at launch | Undetermined. Options: (a) move DNS from Wix to Cloudflare; (b) keep DNS at Wix and point `www` to Cloudflare via a custom hostname (canonical host is `www`). Decide before Phase 7 |

## DO NOT TOUCH

- `public` schema tables, data, functions, and the existing cron job in Supabase `egadvqpatnlkvgiiszzx`.
- `auth`, `storage` (existing bucket), `vault`, `realtime` internals.
- `docs/constitution/*` (owner-authored).
- `docs/reference/site/CWR-sitemap.xml`, `docs/reference/site/CWR-routes.ts`, `docs/reference/brand/*` (reference originals).
- `docs/reference/design/modern-editorial/*` (frozen design reference; change only with an owner-approved Style §11 change).
- Google Workspace MX/SPF/DKIM DNS records.
- `~/.claude/settings.json` (global settings).

## Downstream Impact Analysis

### Level 1 — Direct
Files: new app source, `supabase/migrations/*`, `.github/workflows/*`, `wrangler.jsonc`.
Contracts: new schema `cwr`; new auth users; new storage bucket `cwr-media`.

### Level 2 — Dependent
Files/services: Supabase API exposed schemas (adds `cwr`); Supabase Auth settings (MFA, session timeout).
Risk: approved (item 1) — exposing `cwr` is safe only because every `cwr` table ships with RLS and per-role tests.

### Level 3 — Cascading
Services: DNS (web + email delivery), Google Search rankings (redirects), ad platform conversion tracking, Google Workspace mail.
Risk: **requires human approval before Phase 7** (item 4) — a DNS mistake can stop company email; redirect gaps can drop search rankings. Mitigated by preserving all mail records and a 404 review in Google Search Console after launch.

## Gate 3 — confirmed stack versions (npm, 2026-09-25)

next 16.3.6 · react 19.3.0 · @opennextjs/cloudflare 1.20.6 (supports next ≥16.3.3) · wrangler 4.140.0 · @supabase/supabase-js 2.117.2 · @supabase/ssr 0.12.7 · supabase CLI 2.118.0 · zod 4.6.5 · @anthropic-ai/sdk 0.128.0 · tailwindcss 4.3.3 · vitest 5.0.2 · @playwright/test 1.63.0. TypeScript: use the newest release Next.js 16.3 supports (verify at scaffold; 7.0.2 is latest).
