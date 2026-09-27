import { cache } from "react";
import { z } from "zod";

import {
  HOMEWORK_FILES_BUCKET,
  HOMEWORK_GROUPS,
  HOMEWORK_GROUP_KEYS,
  HOMEWORK_KINDS,
  getDownloadLabel,
  getDurationLabel,
  getFileSizeLabel,
  getFormatLabel,
  type HomeworkGroupKey,
} from "@/lib/content/homework-rules";
import { CWR_TENANT_SLUG, SupabaseQueryError, getPublicClient } from "@/lib/supabase/public-client";

// Visible Homework videos, downloads, and links in the order staff set in Admin → Homework.
// Row Level Security hides hidden and deleted items.

const MAX_HOMEWORK_ITEMS = 200;
const PDF_EXTENSION = /\.pdf(?:$|[?#])/i;
const PRESENTATION_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const HOMEWORK_COLUMNS =
  "id, kind, group_key, title, description, is_spanish, file_path, file_name, file_mime, file_size_bytes, duration_seconds, captions_path, link_url, photo_path, photo_alt, photo_width, photo_height, tenants!inner(slug)";

const homeworkRowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(HOMEWORK_KINDS),
  group_key: z.enum(HOMEWORK_GROUP_KEYS).nullable(),
  title: z.string(),
  description: z.string(),
  is_spanish: z.boolean(),
  file_path: z.string().nullable(),
  file_name: z.string().nullable(),
  file_mime: z.string().nullable(),
  file_size_bytes: z.number().int().nullable(),
  duration_seconds: z.number().int().nullable(),
  captions_path: z.string().nullable(),
  link_url: z.string().nullable(),
  photo_path: z.string().nullable(),
  photo_alt: z.string().nullable(),
  photo_width: z.number().int().nullable(),
  photo_height: z.number().int().nullable(),
});

export type HomeworkRow = z.infer<typeof homeworkRowSchema>;

export type HomeworkCover = { folder: string; alt: string; width: number; height: number };

export type HomeworkVideo = {
  id: string;
  title: string;
  description: string;
  isSpanish: boolean;
  videoUrl: string;
  captionsUrl: string | null;
  lengthLabel: string | null;
  cover: HomeworkCover | null;
};

export type DownloadIcon = "document" | "presentation" | "link";

export type HomeworkDownload = {
  id: string;
  title: string;
  description: string;
  isSpanish: boolean;
  href: string;
  detailLabel: string;
  buttonLabel: string;
  icon: DownloadIcon;
};

export type HomeworkGroup = { key: HomeworkGroupKey; label: string; downloads: HomeworkDownload[] };

export type HomeworkContent = { videos: HomeworkVideo[]; groups: HomeworkGroup[] };

/** Public address of a stored Homework file; null when the site runs without database settings. */
export function getHomeworkFileUrl(path: string): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;
  return `${baseUrl}/storage/v1/object/public/${HOMEWORK_FILES_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function getCover({ photo_path, photo_alt, photo_width, photo_height }: HomeworkRow): HomeworkCover | null {
  if (!photo_path || !photo_alt || !photo_width || !photo_height) return null;
  return { folder: photo_path, alt: photo_alt, width: photo_width, height: photo_height };
}

function getVideo(row: HomeworkRow): HomeworkVideo | null {
  const videoUrl = row.file_path ? getHomeworkFileUrl(row.file_path) : null;
  if (!videoUrl) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    isSpanish: row.is_spanish,
    videoUrl,
    captionsUrl: row.captions_path ? getHomeworkFileUrl(row.captions_path) : null,
    lengthLabel: row.duration_seconds ? getDurationLabel(row.duration_seconds) : null,
    cover: getCover(row),
  };
}

function getFileDownload(row: HomeworkRow): HomeworkDownload | null {
  const fileUrl = row.file_path ? getHomeworkFileUrl(row.file_path) : null;
  if (!fileUrl || !row.file_mime || !row.file_name || !row.file_size_bytes) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    isSpanish: row.is_spanish,
    // Supabase names the saved file after ?download=, so visitors get a readable file name.
    href: `${fileUrl}?download=${encodeURIComponent(row.file_name)}`,
    detailLabel: `${getFormatLabel(row.file_mime)} · ${getFileSizeLabel(row.file_size_bytes)}`,
    buttonLabel: getDownloadLabel({ mime: row.file_mime, isSpanish: row.is_spanish }),
    icon: row.file_mime === PRESENTATION_MIME ? "presentation" : "document",
  };
}

function getLinkDownload(row: HomeworkRow): HomeworkDownload | null {
  if (!row.link_url) return null;
  const host = new URL(row.link_url).hostname.replace(/^www\./, "");
  const isPdf = PDF_EXTENSION.test(row.link_url);
  const verb = row.is_spanish ? "Descargar" : "Download";
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    isSpanish: row.is_spanish,
    href: row.link_url,
    detailLabel: isPdf ? `PDF · from ${host}` : `Link · ${host}`,
    buttonLabel: isPdf ? `${verb} PDF` : row.is_spanish ? "Visitar el sitio" : "Visit website",
    icon: isPdf ? "document" : "link",
  };
}

function getDownload(row: HomeworkRow): HomeworkDownload | null {
  return row.kind === "link" ? getLinkDownload(row) : getFileDownload(row);
}

/** Videos, then the groups that have at least one item, in HOMEWORK_GROUPS order. */
export function getHomeworkContent(rows: HomeworkRow[]): HomeworkContent {
  const videos = rows.filter((row) => row.kind === "video").map(getVideo).filter((video) => video !== null);
  const groups = HOMEWORK_GROUPS.map(({ key, label }) => ({
    key,
    label,
    downloads: rows.filter((row) => row.group_key === key).map(getDownload).filter((download) => download !== null),
  })).filter((group) => group.downloads.length > 0);
  return { videos, groups };
}

/** Throws SupabaseQueryError when the database fails. */
export const fetchHomework = cache(async (): Promise<HomeworkContent> => {
  const client = getPublicClient();
  if (!client) return { videos: [], groups: [] };
  const { data: rows, error } = await client
    .from("homework_items")
    .select(HOMEWORK_COLUMNS)
    .eq("tenants.slug", CWR_TENANT_SLUG)
    .order("sort_order")
    .order("title")
    .limit(MAX_HOMEWORK_ITEMS);
  if (error) throw new SupabaseQueryError(error.message, { operation: "fetchHomework", cause: error });
  return getHomeworkContent(z.array(homeworkRowSchema).parse(rows));
});
