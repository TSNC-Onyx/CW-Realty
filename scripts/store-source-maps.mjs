// Keeps this release's source maps in the private Supabase bucket "source-maps", so stack
// traces can be read back to our files (docs/error-logging-a-grade-plan.md, Phase C).
// Runs after `opennextjs-cloudflare build` in the Cloudflare build (npm run release:build).
//
// Stores source-maps/<commit>/browser.json.gz (browser chunk maps, keyed by address) and
// server.json.gz (the Worker bundle's map plus the server chunk maps it leads to). The Worker
// map comes from `wrangler deploy --dry-run`, which bundles exactly as the real deploy does.
// Keeps the last 15 releases. Never fails the release: anything that goes wrong is a warning.
//
// Needs build-only secrets SOURCE_MAPS_SUPABASE_URL and SOURCE_MAPS_SERVICE_KEY, and the
// commit id Cloudflare Workers Builds provides (WORKERS_CI_COMMIT_SHA). See
// docs/runbooks/source-maps.md.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { createClient } from "@supabase/supabase-js";

const BUCKET = "source-maps";
const KEPT_RELEASES = 15;
const INDEX_FILE = "index.json";
const BROWSER_MAPS_DIR = ".next/private-source-maps/static";
const PUBLISHED_STATIC_DIR = ".next/static";
const SOURCE_MAPPING_URL_PATTERN = /\/\/# sourceMappingURL=([^\s]+)\s*$/;
const SERVER_DIR = ".next/server";
const WORKER_OUT_DIR = ".release-maps/worker";
const SERVER_CHUNK_MARKER = "server-functions/default/";
const RELEASE_PATTERN = /^[0-9a-f]{7,40}$/;

class SourceMapStoreError extends Error {
  constructor(message, context) {
    super(message);
    this.name = "SourceMapStoreError";
    this.context = context;
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function getScriptFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

// Each published script names its own map in its last line; Turbopack's map names differ
// from the script names, so the link is followed rather than guessed.
function getBrowserMapFile(scriptFile) {
  const match = SOURCE_MAPPING_URL_PATTERN.exec(readFileSync(scriptFile, "utf8").slice(-300));
  if (!match) return null;
  const publishedMap = path.join(path.dirname(scriptFile), match[1]);
  const privateMap = path.join(BROWSER_MAPS_DIR, path.relative(PUBLISHED_STATIC_DIR, publishedMap));
  return existsSync(privateMap) ? privateMap : null;
}

function getBrowserMaps() {
  const maps = {};
  for (const scriptFile of getScriptFiles(PUBLISHED_STATIC_DIR)) {
    const mapFile = getBrowserMapFile(scriptFile);
    if (!mapFile) continue;
    maps[`/_next/static/${path.relative(PUBLISHED_STATIC_DIR, scriptFile).split(path.sep).join("/")}`] = readJson(mapFile);
  }
  return maps;
}

function makeWorkerMap() {
  rmSync(WORKER_OUT_DIR, { recursive: true, force: true });
  execFileSync("npx", ["wrangler", "deploy", "--dry-run", "--outdir", WORKER_OUT_DIR], { stdio: "ignore" });
  const mapFile = path.join(WORKER_OUT_DIR, "worker.js.map");
  if (!existsSync(mapFile)) throw new SourceMapStoreError("wrangler wrote no worker.js.map", { mapFile });
  return readJson(mapFile);
}

function getServerChunkMaps(workerMap) {
  const chunks = {};
  for (const source of workerMap.sources) {
    if (!source.includes(SERVER_CHUNK_MARKER)) continue;
    const chunkKey = decodeURIComponent(source.slice(source.indexOf(SERVER_CHUNK_MARKER) + SERVER_CHUNK_MARKER.length));
    const mapFile = path.join(SERVER_DIR, path.relative(".next/server", chunkKey)) + ".map";
    if (existsSync(mapFile)) chunks[chunkKey] = readJson(mapFile);
  }
  return chunks;
}

const BUCKET_OPTIONS = { public: false, fileSizeLimit: 52_428_800, allowedMimeTypes: ["application/gzip", "application/json"] };

// Creates the bucket private, and makes it private again if anyone ever changed that.
async function ensurePrivateBucket(client) {
  const { data } = await client.storage.getBucket(BUCKET);
  const { error } = data ? await client.storage.updateBucket(BUCKET, BUCKET_OPTIONS) : await client.storage.createBucket(BUCKET, BUCKET_OPTIONS);
  if (error) throw new SourceMapStoreError(`Couldn't make the ${BUCKET} bucket private: ${error.message}`, { bucket: BUCKET });
}

async function upload({ storage, objectPath, body, contentType }) {
  const { error } = await storage.upload(objectPath, body, { contentType, upsert: true });
  if (error) throw new SourceMapStoreError(`Upload of ${objectPath} failed: ${error.message}`, { objectPath });
}

async function fetchReleaseIndex(storage) {
  const { data, error } = await storage.download(INDEX_FILE);
  if (error || !data) return [];
  const parsed = JSON.parse(await data.text());
  return Array.isArray(parsed.releases) ? parsed.releases.filter((release) => RELEASE_PATTERN.test(release)) : [];
}

async function removeOldReleases({ storage, releases }) {
  for (const release of releases) {
    const { error } = await storage.remove([`${release}/browser.json.gz`, `${release}/server.json.gz`]);
    if (error) console.warn(`store-source-maps: couldn't remove release ${release}: ${error.message}`);
  }
}

async function storeSourceMaps({ url, serviceKey, release }) {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await ensurePrivateBucket(client);
  const storage = client.storage.from(BUCKET);
  const workerMap = makeWorkerMap();
  const server = { worker: workerMap, chunks: getServerChunkMaps(workerMap) };
  const browser = getBrowserMaps();
  await upload({ storage, objectPath: `${release}/browser.json.gz`, body: gzipSync(JSON.stringify(browser)), contentType: "application/gzip" });
  await upload({ storage, objectPath: `${release}/server.json.gz`, body: gzipSync(JSON.stringify(server)), contentType: "application/gzip" });
  const releases = [...(await fetchReleaseIndex(storage)).filter((kept) => kept !== release), release];
  const keptReleases = releases.slice(-KEPT_RELEASES);
  await upload({ storage, objectPath: INDEX_FILE, body: JSON.stringify({ releases: keptReleases }), contentType: "application/json" });
  await removeOldReleases({ storage, releases: releases.slice(0, -KEPT_RELEASES) });
  console.log(`store-source-maps: stored release ${release} (${Object.keys(browser).length} browser maps, ${Object.keys(server.chunks).length} server chunk maps).`);
}

const PRODUCTION_BRANCH = "build1";
const release = process.env.WORKERS_CI_COMMIT_SHA ?? "";
// Preview builds of other branches would push the live site's maps out of the 15 kept.
const branch = process.env.WORKERS_CI_BRANCH ?? PRODUCTION_BRANCH;
const url = process.env.SOURCE_MAPS_SUPABASE_URL ?? "";
const serviceKey = process.env.SOURCE_MAPS_SERVICE_KEY ?? "";

if (branch !== PRODUCTION_BRANCH) {
  console.log(`store-source-maps: skipped for preview branch ${branch}; only ${PRODUCTION_BRANCH} releases are kept.`);
} else if (!RELEASE_PATTERN.test(release) || !url || !serviceKey) {
  console.warn("store-source-maps: skipped; needs WORKERS_CI_COMMIT_SHA, SOURCE_MAPS_SUPABASE_URL and SOURCE_MAPS_SERVICE_KEY (docs/runbooks/source-maps.md). Stack traces from this release can't be read back.");
} else {
  await storeSourceMaps({ url, serviceKey, release }).catch((error) => {
    console.warn(`store-source-maps: ${error instanceof Error ? error.message : String(error)}. The release continues; its stack traces can't be read back.`);
  });
}
