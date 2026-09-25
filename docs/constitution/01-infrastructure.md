# Infrastructure Constitution

> Section 1 of 4. Binding for all work in this repo. Supplied by the owner on 2026-09-25; do not edit without owner approval.

## 1. Workflows (DORA, Trunk Based Development)

- Every change moves through one path: branch, pull request, automated checks, review, merge, deploy
- Small, frequent merges to main; no long lived branches
- CI must pass lint, type check, tests, and migration checks before any merge
- Preview environment for every pull request; production deploys are automated and repeatable
- Every deploy can be rolled back in under five minutes
- Track deploy frequency, lead time, change failure rate, and recovery time
- Use feature flags to release unfinished work safely
- Keep configuration in environment variables, separate for each environment

## 2. Security (OWASP Top 10 2025, OWASP ASVS)

- Row Level Security enabled on every table, with policies tested per role
- Tenant isolation enforced in both the service layer and the database
- Service role keys stay server side only and never reach the browser
- Secrets live in a managed store; rotate them and never commit them to git
- Validate every input on the server using shared schemas
- Least privilege access for every user, service, and API key
- Scan dependencies automatically and patch critical issues within seven days
- Verify every Stripe webhook signature and rate limit all public endpoints
- Require multi factor authentication for all admin and owner accounts
- Set security headers, including a strict Content Security Policy
- Encrypt data in transit and at rest

## 3. Reliability (Google SRE)

- Define service level objectives for uptime and response time on critical paths
- All mutations are transactional and idempotent, so retries never duplicate work
- Background jobs retry with backoff and send failures to a dead letter queue
- Daily backups with point in time recovery; test a restore every quarter
- Fail gracefully: show a clear message and keep the rest of the page working
- Use expand then contract migrations so schema changes never cause downtime

## 4. Auditability

- Every write records who, what, when, tenant, and the before and after values
- Audit logs are append only and cannot be edited or deleted by users
- Set a written retention period for audit records and enforce it automatically
- Structured logs with a request ID that follows a request end to end (OpenTelemetry)
- Database changes happen only through versioned, reviewed migrations
- Status changes go only through the Workflow Engine and are logged every time

## 5. Performance (Google Core Web Vitals)

- Largest Contentful Paint under 2.5 seconds, Interaction to Next Paint under 200ms, Cumulative Layout Shift under 0.1
- Render on the server by default; ship client JavaScript only for interactivity
- Cache static assets at the edge and stream slow page sections
- Search results appear in under 300ms, using indexes and debounced input
- Paginate every list; never load unbounded rows
- Index every column used in filters, joins, and sorting; review slow query logs weekly
- Write RLS policies for speed, and run Supabase advisors before every release
- Serve images in AVIF or WebP at the correct size, and lazy load below the fold

## 6. Scalability

- Stateless application servers that scale horizontally
- Use connection pooling for all database access
- Heavy work runs in background queues, never inside a user request
- Set performance budgets in CI and fail builds that exceed them
- Load test critical flows before launch and after major changes

## 7. Observability

- Monitor errors, latency, and Core Web Vitals from real user data
- Alert on symptoms users feel, not on every internal metric
- Every incident gets a blameless review with tracked follow up actions
- Keep a public status page and a written runbook for each critical system
