# CW-Realty
Refreshed CWRealty website

## Branches

- **`build1`** — all development work. Pull requests target `build1`, and CI runs on every push and pull request to it.
- **`main`** — the live site. It is **not merged into or used until go-live day**; merging into `main` deploys to production (see `.github/workflows/deploy.yml`).

## Configuration

Public build settings (GitHub repository **variables**, also set locally in `.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL` — the Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the Supabase publishable (anon) key. Safe to expose: Row Level Security limits it to published content.

Without them the site still runs, but phone, email, office address, and database redirects are hidden or skipped.

Server-only secret (Cloudflare Worker secret and GitHub secret — never `NEXT_PUBLIC_`):

- `SUPABASE_SERVICE_ROLE_KEY` — used only on the server for invites, photo uploads, and the content import.

## Admin portal

- Sign in at `/admin` with a password plus an authenticator-app code.
- Create the first owner: `npm run admin:invite -- person@example.com owner` (with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set). Owners invite everyone else from **Users & roles**.

## Local development

```bash
npx supabase start
npm run content:import:local
npm run dev
```
