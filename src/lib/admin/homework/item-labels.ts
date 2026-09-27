import type { AdminHomeworkItem } from "@/lib/admin/homework/queries";
import type { HomeworkCover } from "@/lib/content/homework";
import { getDurationLabel, getFileSizeLabel, getFormatLabel } from "@/lib/content/homework-rules";

// What Admin → Homework shows about an item: its type, length, and size in plain words.

const NO_FILE_YET = "No file yet";

function getLinkHost(linkUrl: string): string {
  try {
    return new URL(linkUrl).hostname.replace(/^www\./, "");
  } catch {
    return linkUrl;
  }
}

function getVideoDetail(item: AdminHomeworkItem): string {
  if (!item.file_size_bytes) return `Video · ${NO_FILE_YET}`;
  const parts = ["Video", item.duration_seconds ? getDurationLabel(item.duration_seconds) : null, getFileSizeLabel(item.file_size_bytes)];
  return parts.filter(Boolean).join(" · ");
}

/** "Video · 1:14 · 12 MB", "Download · PDF · 1.3 MB", "Link · ncrec.gov" */
export function getItemDetail(item: AdminHomeworkItem): string {
  if (item.kind === "video") return getVideoDetail(item);
  if (item.kind === "link") return `Link · ${item.link_url ? getLinkHost(item.link_url) : ""}`;
  if (!item.file_mime || !item.file_size_bytes) return `Download · ${NO_FILE_YET}`;
  return `Download · ${getFormatLabel(item.file_mime)} · ${getFileSizeLabel(item.file_size_bytes)}`;
}

/** "MP4 video · 12 MB · 1:14" or "PDF · 1.3 MB" for the edit page's current file card. */
export function getStoredFileDetail(item: AdminHomeworkItem): string | null {
  if (!item.file_mime || !item.file_size_bytes) return null;
  const length = item.duration_seconds ? ` · ${getDurationLabel(item.duration_seconds)}` : "";
  return `${getFormatLabel(item.file_mime)} · ${getFileSizeLabel(item.file_size_bytes)}${length}`;
}

export function getItemCover(item: AdminHomeworkItem): HomeworkCover | null {
  const { photo_path, photo_alt, photo_width, photo_height } = item;
  if (!photo_path || !photo_alt || !photo_width || !photo_height) return null;
  return { folder: photo_path, alt: photo_alt, width: photo_width, height: photo_height };
}
