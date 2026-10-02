// Imports the current live-site listings, photos, team members, connections, and Homework
// videos and guides (Phase 2, task 11; connections added 2026-09-26, Homework 2026-09-27).
// Insert-only and safe to re-run: records that already exist (by slug, or by name or title for connections and Homework) are skipped and
// never changed, so edits made later in the admin portal are kept.
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-live-site-content.mjs
// Local:  npm run content:import:local   (reads the local stack's URL and key)

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import photoLayout from "../src/lib/content/photo-layout.json" with { type: "json" };

// CONTENT_FILE lets CI import small test content (tests/fixtures/test-content.json) instead.
const CONTENT_FILE = process.env.CONTENT_FILE ? new URL(process.env.CONTENT_FILE, `file://${process.cwd()}/`) : new URL("./content/live-site-content.json", import.meta.url);
const TENANT_SLUG = "cwr";
// New listings start as Coming Soon (supabase/migrations/20261002000200); a listing in the
// content file moves from there to its own status.
const STARTING_LISTING_STATUS = "coming_soon";
const QUALITY = { avif: 50, webp: 75 };
// Removes solid frames that Wix graphics drew around some photos.
const FRAME_TRIM_THRESHOLD = 80;
const CONTENT_TYPES = { avif: "image/avif", webp: "image/webp" };
// Homework files (src/lib/content/homework-rules.ts; supabase/config.toml cwr-files).
const FILES_BUCKET = "cwr-files";
// 50 MiB, the same limit as supabase/config.toml and the admin upload check.
const FILES_BUCKET_LIMIT_BYTES = 50 * 1024 * 1024;
const FILES_BUCKET_MIME_TYPES = [
  "video/mp4",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/vtt",
];

class ImportError extends Error {
  constructor(message, context) {
    super(message);
    this.name = "ImportError";
    this.context = context;
  }
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new ImportError(`Missing environment variable ${name}`, { name });
  return value;
}

function getAdminClient() {
  return createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    db: { schema: "cwr" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getCheckedResult({ data, error }, operation) {
  if (error) throw new ImportError(`${operation}: ${error.message}`, { operation });
  return data;
}

// ------------------------------------------------------------------ photos

// Web addresses are downloaded; anything else is a file next to the content file.
async function fetchSourceBytes(sourceUrl) {
  if (!/^https?:\/\//.test(sourceUrl)) return readFile(new URL(sourceUrl, CONTENT_FILE));
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new ImportError(`Download failed (${response.status})`, { sourceUrl });
  return Buffer.from(await response.arrayBuffer());
}

async function getPreparedImage(source, crop) {
  const oriented = sharp(source).rotate();
  const prepared = crop === "trim" ? oriented.trim({ threshold: FRAME_TRIM_THRESHOLD }) : oriented;
  const buffer = await prepared.toBuffer();
  const { width, height } = await sharp(buffer).metadata();
  return { buffer, width, height };
}

async function getVariant({ buffer, targetWidth, format }) {
  return sharp(buffer).resize({ width: targetWidth, withoutEnlargement: true })[format]({ quality: QUALITY[format] }).toBuffer();
}

async function uploadVariant(storage, { folder, width, format, body }) {
  const path = `${folder}/${width}.${format}`;
  const result = await storage.from(photoLayout.bucket).upload(path, body, { contentType: CONTENT_TYPES[format], upsert: true });
  getCheckedResult(result, `upload ${path}`);
}

/** Downloads one photo and stores every width/format variant; returns its original size. */
async function importPhoto(storage, { source, crop, folder }) {
  const image = await getPreparedImage(await fetchSourceBytes(source), crop);
  for (const width of photoLayout.widths) {
    for (const format of photoLayout.formats) {
      const body = await getVariant({ buffer: image.buffer, targetWidth: width, format });
      await uploadVariant(storage, { folder, width, format, body });
    }
  }
  return { width: image.width, height: image.height };
}

// ------------------------------------------------------------------ records

async function ensureMediaBucket(storage) {
  const { data: bucket } = await storage.getBucket(photoLayout.bucket);
  if (bucket) return;
  const result = await storage.createBucket(photoLayout.bucket, {
    public: true,
    fileSizeLimit: "10MB",
    allowedMimeTypes: Object.values(CONTENT_TYPES),
  });
  getCheckedResult(result, "create bucket");
}

async function ensureFilesBucket(storage) {
  const { data: bucket } = await storage.getBucket(FILES_BUCKET);
  if (bucket) return;
  const result = await storage.createBucket(FILES_BUCKET, { public: true, fileSizeLimit: FILES_BUCKET_LIMIT_BYTES, allowedMimeTypes: FILES_BUCKET_MIME_TYPES });
  getCheckedResult(result, "create files bucket");
}

async function fetchTenantId(db) {
  const tenant = getCheckedResult(await db.from("tenants").select("id").eq("slug", TENANT_SLUG).single(), "find tenant");
  return tenant.id;
}

async function fetchExistingHomeworkTitles(db, tenantId) {
  const rows = getCheckedResult(await db.from("homework_items").select("title").eq("tenant_id", tenantId), "read homework");
  return new Set(rows.map((row) => row.title));
}

async function fetchExistingConnectionNames(db) {
  const rows = getCheckedResult(await db.from("connections").select("full_name"), "read connections");
  return new Set(rows.map((row) => row.full_name));
}

async function fetchExistingSlugs(db, table) {
  const rows = getCheckedResult(await db.from(table).select("slug"), `read ${table}`);
  return new Set(rows.map((row) => row.slug));
}

// Folders follow the same layout as admin uploads — team/<member id>/<photo id> and
// listings/<listing id>/<photo id> — so the portal can edit, undo, and clean them up.
async function importTeamMember(client, { tenantId, member }) {
  const memberId = randomUUID();
  const folder = `team/${memberId}/${randomUUID()}`;
  const size = member.photo ? await importPhoto(client.storage, { source: member.photo.source, folder }) : null;
  const row = {
    id: memberId,
    tenant_id: tenantId,
    slug: member.slug,
    full_name: member.fullName,
    job_title: member.jobTitle,
    bio: member.bio,
    email: member.email,
    phone: member.phone,
    is_visible: member.isVisible,
    sort_order: member.sortOrder,
    photo_path: size ? folder : null,
    photo_alt: size ? member.photo.alt : null,
    photo_width: size?.width ?? null,
    photo_height: size?.height ?? null,
  };
  getCheckedResult(await client.from("team_members").insert(row), `insert team member ${member.slug}`);
}

async function importConnection(client, { tenantId, connection }) {
  const connectionId = randomUUID();
  const folder = `connections/${connectionId}/${randomUUID()}`;
  const size = connection.photo ? await importPhoto(client.storage, { source: connection.photo.source, folder }) : null;
  const row = {
    id: connectionId,
    tenant_id: tenantId,
    full_name: connection.fullName,
    category: connection.category,
    title_line: connection.titleLine,
    phone: connection.phone,
    sort_order: connection.sortOrder,
    photo_path: size ? folder : null,
    photo_alt: size ? connection.photo.alt : null,
    photo_width: size?.width ?? null,
    photo_height: size?.height ?? null,
  };
  getCheckedResult(await client.from("connections").insert(row), `insert connection ${connection.fullName}`);
}

function getStorageFileName(fileName) {
  const dot = fileName.lastIndexOf(".");
  const base = fileName.slice(0, dot).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "file"}.${fileName.slice(dot + 1).toLowerCase()}`;
}

// Same layout as admin uploads: homework/<item id>/<upload id>/<file name> in cwr-files,
// and cover pictures at homework/<item id>/<photo id> in cwr-media.
async function importHomeworkFile(storage, { itemId, file }) {
  const path = `homework/${itemId}/${randomUUID()}/${getStorageFileName(file.fileName)}`;
  const body = await fetchSourceBytes(file.source);
  const result = await storage.from(FILES_BUCKET).upload(path, body, { contentType: file.mime, upsert: false });
  getCheckedResult(result, `upload ${path}`);
  return { file_path: path, file_name: file.fileName, file_mime: file.mime, file_size_bytes: body.length };
}

async function importHomeworkCover(storage, { itemId, cover }) {
  if (!cover) return {};
  const folder = `homework/${itemId}/${randomUUID()}`;
  const size = await importPhoto(storage, { source: cover.source, folder });
  return { photo_path: folder, photo_alt: cover.alt, photo_width: size.width, photo_height: size.height };
}

async function importHomeworkItem(client, { tenantId, item }) {
  const itemId = randomUUID();
  const fileColumns = item.file ? await importHomeworkFile(client.storage, { itemId, file: item.file }) : {};
  const coverColumns = await importHomeworkCover(client.storage, { itemId, cover: item.cover });
  const row = {
    id: itemId,
    tenant_id: tenantId,
    kind: item.kind,
    group_key: item.group ?? null,
    title: item.title,
    description: item.description,
    is_spanish: item.isSpanish ?? false,
    duration_seconds: item.durationSeconds ?? null,
    link_url: item.linkUrl ?? null,
    sort_order: item.sortOrder,
    is_visible: true,
    ...fileColumns,
    ...coverColumns,
  };
  getCheckedResult(await client.from("homework_items").insert(row), `insert homework ${item.title}`);
}

// All downloads and uploads happen before any listing row exists, so an interrupted
// run never leaves a half-made listing behind.
async function importListingPhotoFiles(storage, { listing, listingId }) {
  const photoRows = [];
  for (const [index, photo] of listing.photos.entries()) {
    const folder = `listings/${listingId}/${randomUUID()}`;
    const size = await importPhoto(storage, { source: photo.source, crop: photo.crop, folder });
    photoRows.push({ storage_path: folder, alt_text: photo.alt, ...size, sort_order: index + 1 });
  }
  return photoRows;
}

async function publishListing(client, { listing, listingId }) {
  if (listing.status !== STARTING_LISTING_STATUS) {
    getCheckedResult(
      await client.rpc("transition", { p_workflow_key: "listing_status", p_record_id: listingId, p_to_state: listing.status }),
      `set status ${listing.slug}`,
    );
  }
  getCheckedResult(
    await client.rpc("transition", { p_workflow_key: "listing_publish", p_record_id: listingId, p_to_state: "live" }),
    `publish ${listing.slug}`,
  );
}

function getListingRow({ tenantId, listing, listingId }) {
  return {
    id: listingId,
    tenant_id: tenantId,
    slug: listing.slug,
    street_address: listing.streetAddress,
    city: listing.city,
    postal_code: listing.postalCode,
    price_cents: listing.priceDollars * 100,
    description: listing.description,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    square_feet: listing.squareFeet,
    sort_order: listing.sortOrder,
  };
}

async function removeListing(client, listingId) {
  const { error } = await client.from("listings").delete().eq("id", listingId);
  if (error) console.error(`Could not remove the unfinished listing ${listingId}; delete it before re-running: ${error.message}`);
}

async function saveListingRows(client, { tenantId, listing, photoRows, listingId }) {
  const rows = photoRows.map((row) => ({ ...row, tenant_id: tenantId, listing_id: listingId }));
  getCheckedResult(await client.from("listing_photos").insert(rows), `insert photos for ${listing.slug}`);
  await publishListing(client, { listing, listingId });
}

// Files first, then the listing, its photos, and its status in quick succession.
// If a database step fails, the listing is removed again so a re-run starts clean.
async function importListing(client, { tenantId, listing }) {
  const listingId = randomUUID();
  const photoRows = await importListingPhotoFiles(client.storage, { listing, listingId });
  const inserted = getCheckedResult(
    await client.from("listings").insert(getListingRow({ tenantId, listing, listingId })).select("id").single(),
    `insert listing ${listing.slug}`,
  );
  try {
    await saveListingRows(client, { tenantId, listing, photoRows, listingId: inserted.id });
  } catch (error) {
    await removeListing(client, inserted.id);
    throw error;
  }
}

async function importAll(client, content) {
  const tenantId = await fetchTenantId(client);
  const existingMembers = await fetchExistingSlugs(client, "team_members");
  const existingListings = await fetchExistingSlugs(client, "listings");
  for (const member of content.team) {
    if (existingMembers.has(member.slug)) continue;
    await importTeamMember(client, { tenantId, member });
    console.log(`Imported team member ${member.slug}`);
  }
  for (const listing of content.listings) {
    if (existingListings.has(listing.slug)) continue;
    await importListing(client, { tenantId, listing });
    console.log(`Imported listing ${listing.slug}`);
  }
  const existingConnections = await fetchExistingConnectionNames(client);
  for (const connection of content.connections ?? []) {
    if (existingConnections.has(connection.fullName)) continue;
    await importConnection(client, { tenantId, connection });
    console.log(`Imported connection ${connection.fullName}`);
  }
  const existingHomework = await fetchExistingHomeworkTitles(client, tenantId);
  for (const item of content.homework ?? []) {
    if (existingHomework.has(item.title)) continue;
    await importHomeworkItem(client, { tenantId, item });
    console.log(`Imported homework ${item.title}`);
  }
}

async function main() {
  const content = JSON.parse(readFileSync(CONTENT_FILE, "utf8"));
  const client = getAdminClient();
  await ensureMediaBucket(client.storage);
  await ensureFilesBucket(client.storage);
  await importAll(client, content);
  console.log("Content import finished.");
}

main().catch((error) => {
  console.error(`Content import failed: ${error.message}`, error.context ?? "");
  process.exit(1);
});
