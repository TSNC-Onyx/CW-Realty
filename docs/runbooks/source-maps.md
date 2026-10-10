# Readable stack traces: source-map setup (one time, about 5 minutes)

Owner step from `docs/error-logging-a-grade-plan.md` (Phase C, approved 2026-10-10). Until it
is done the site works normally; the Problems page just says the code maps for a problem
aren't stored, and the build log shows `store-source-maps: skipped`.

## What it does

Each time Cloudflare builds the site, a short extra step keeps that version's "code maps" in a
locked Supabase storage folder (`source-maps`). They turn a stack trace like
`at a (chunk.js:1:23456)` into `src/lib/admin/listings/queries.ts:60`. They are never
published on the website; only owners can open them, through links that expire after
5 minutes. The last 15 live versions are kept; preview builds of other branches are skipped.

## Steps

1. In Supabase, open the project **egadvqpatnlkvgiiszzx** → **Project Settings** → **API Keys**,
   and copy the **service_role** (secret) key. Keep it private.
2. In Cloudflare, open **Workers & Pages** → **cw-realty** → **Settings** → **Build**.
3. Under **Build configuration**, set **Build command** to:

   ```
   npm run release:build
   ```

   Check the **Deploy command** is `npx wrangler deploy` or `npx opennextjs-cloudflare deploy`.
   If it is `npm run deploy`, change it to `npx opennextjs-cloudflare deploy`: `npm run deploy`
   builds the site a second time, and the stored maps would no longer match what goes live.
4. Under **Variables and secrets** (build), add:
   - `SOURCE_MAPS_SUPABASE_URL` = `https://egadvqpatnlkvgiiszzx.supabase.co` (type: text)
   - `SOURCE_MAPS_SERVICE_KEY` = the key from step 1 (type: **secret**)
5. Save. The next merge to `build1` builds with the new step.

## Checking it worked

In the next build's log, look for a line like
`store-source-maps: stored release d8bd8e9… (48 browser maps, 223 server chunk maps).`
On the Problems page, open any problem with a stack trace from a later release and press
**Show the code location**.

## If something goes wrong

- `store-source-maps: …` warnings never stop a release; the site still goes live.
- `patch-opennext-sourcemap: OpenNext changed` **does** stop the release build (installs and
  checks only warn). It means an OpenNext upgrade changed the file
  `scripts/patch-opennext-sourcemap.mjs` adjusts; update that script (it adds
  `sourcemap: true` to OpenNext's server bundle) before releasing.
- To read a trace from a terminal instead:
  `SOURCE_MAPS_SUPABASE_URL=… SOURCE_MAPS_SERVICE_KEY=… npm run problem:trace -- CWR-ABC-123`
