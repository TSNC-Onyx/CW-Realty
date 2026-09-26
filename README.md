# CW-Realty
Refreshed CWRealty website

## Branches

- **`build1`** — all development work. Pull requests target `build1`, and CI runs on every push and pull request to it. Cloudflare Workers Builds (dashboard Git integration) builds and deploys every push to the Worker `cw-realty` at https://cw-realty.onyxventuresnc.workers.dev.
- **`main`** — the live site. It is **not merged into or used until go-live day**; merging into `main` deploys to production (see `.github/workflows/deploy.yml`). On go-live, switch the Workers Builds production branch to `main` and leave the Cloudflare secrets out of GitHub, so only one system deploys the Worker.

## Configuration

Public build settings (Cloudflare Workers Builds **build variables** and GitHub repository **variables**, also set locally in `.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL` — the Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the Supabase publishable (anon) key. Safe to expose: Row Level Security limits it to published content.

Without them the site still runs, but phone, email, office address, and database redirects are hidden or skipped.

Server-only secret (Cloudflare Worker secret and GitHub secret — never `NEXT_PUBLIC_`):

- `SUPABASE_SERVICE_ROLE_KEY` — used only on the server for invites, photo uploads, the content import, and alert emails.
- `MAILERSEND_API_KEY` — alert and reply emails (with Worker secrets `ALERT_FROM_EMAIL`, `ALERT_FROM_NAME`; plain dashboard variables are wiped by each deploy).
- `TURNSTILE_SECRET_KEY` — bot check on public forms (with build variable `NEXT_PUBLIC_TURNSTILE_SITE_KEY`).

## Admin portal

- Sign in at `/admin` with a password plus an authenticator-app code.
- Create the first owner: `npm run admin:invite -- person@example.com owner` (with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set). Owners invite everyone else from **Users & roles**.

## Local development

```bash
npm run db:start
npm run content:import:local
source scripts/local-test-env.sh
npm run dev
```
