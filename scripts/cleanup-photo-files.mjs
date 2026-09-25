// Removes photo files that no listing or team member uses any more (Admin §7: permanent
// removal). The database's 30-day trash purge deletes rows but cannot reach storage, and an
// interrupted upload can leave files behind. Folders younger than a day are left alone so
// an upload in progress is never touched. Run nightly by .github/workflows/cleanup-photo-files.yml.
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/cleanup-photo-files.mjs

import { createClient } from "@supabase/supabase-js";

import photoLayout from "../src/lib/content/photo-layout.json" with { type: "json" };

const TOP_FOLDERS = ["listings", "team"];
const PAGE_SIZE = 1000;
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

class CleanupError extends Error {
  constructor(message) {
    super(message);
    this.name = "CleanupError";
  }
}

function getClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new CleanupError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey, { db: { schema: "cwr" }, auth: { persistSession: false, autoRefreshToken: false } });
}

async function listAll(bucket, prefix) {
  const entries = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE_SIZE, offset });
    if (error) throw new CleanupError(`Could not list ${prefix}: ${error.message}`);
    entries.push(...data);
    if (data.length < PAGE_SIZE) return entries;
  }
}

async function fetchPhotoFolders(bucket) {
  const folders = [];
  for (const top of TOP_FOLDERS) {
    for (const record of await listAll(bucket, top)) {
      const photos = await listAll(bucket, `${top}/${record.name}`);
      folders.push(...photos.filter((entry) => entry.id === null).map((entry) => `${top}/${record.name}/${entry.name}`));
    }
  }
  return folders;
}

async function fetchAllRows(db, { table, column }) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from(table).select(column).not(column, "is", null).order(column).range(from, from + PAGE_SIZE - 1);
    if (error) throw new CleanupError(`Could not read ${table}: ${error.message}`);
    rows.push(...data.map((row) => row[column]));
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function fetchReferencedFolders(db) {
  const [photoPaths, portraitPaths] = await Promise.all([
    fetchAllRows(db, { table: "listing_photos", column: "storage_path" }),
    fetchAllRows(db, { table: "team_members", column: "photo_path" }),
  ]);
  return new Set([...photoPaths, ...portraitPaths]);
}

// A second, exact check right before deleting, so a list read at the wrong moment can
// never remove files a record uses.
async function isFolderInUse(db, folder) {
  const [{ count: photoCount, error: photoError }, { count: portraitCount, error: portraitError }] = await Promise.all([
    db.from("listing_photos").select("id", { count: "exact", head: true }).eq("storage_path", folder),
    db.from("team_members").select("id", { count: "exact", head: true }).eq("photo_path", folder),
  ]);
  if (photoError || portraitError) throw new CleanupError(`Could not check ${folder}`);
  return (photoCount ?? 0) + (portraitCount ?? 0) > 0;
}

async function removeIfOld(bucket, folder, nowMs) {
  const files = await listAll(bucket, folder);
  const isOld = files.every((file) => nowMs - Date.parse(file.created_at) > MIN_AGE_MS);
  if (!isOld || files.length === 0) return false;
  const { error } = await bucket.remove(files.map((file) => `${folder}/${file.name}`));
  if (error) throw new CleanupError(`Could not remove ${folder}: ${error.message}`);
  return true;
}

async function main() {
  const client = getClient();
  const bucket = client.storage.from(photoLayout.bucket);
  const [folders, referenced] = await Promise.all([fetchPhotoFolders(bucket), fetchReferencedFolders(client)]);
  const unused = folders.filter((folder) => !referenced.has(folder));
  const nowMs = Date.now();
  let removedCount = 0;
  for (const folder of unused) {
    if (await isFolderInUse(client, folder)) continue;
    if (await removeIfOld(bucket, folder, nowMs)) removedCount += 1;
  }
  console.log(`Photo cleanup: ${folders.length} folders, ${unused.length} unused, ${removedCount} removed.`);
}

main().catch((error) => {
  console.error(`Photo cleanup failed: ${error.message}`);
  process.exit(1);
});
