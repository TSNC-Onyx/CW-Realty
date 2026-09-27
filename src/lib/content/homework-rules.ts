// Homework rules shared by the public page, the admin screens, and the upload server
// actions (owner approval 2026-09-27, docs/cwr-site-review-round-plan.md Round 2). The
// groups, kinds, and limits match migration 20260927000100_cwr_homework.sql and the
// cwr-files bucket in supabase/config.toml.

export const HOMEWORK_FILES_BUCKET = "cwr-files";

export const HOMEWORK_KINDS = ["video", "file", "link"] as const;
export type HomeworkKind = (typeof HOMEWORK_KINDS)[number];

export const HOMEWORK_GROUPS = [
  { key: "buyers", label: "For buyers" },
  { key: "sellers", label: "For sellers" },
  { key: "spanish", label: "En español" },
  { key: "required", label: "Required reading in North Carolina" },
] as const;
export type HomeworkGroupKey = (typeof HOMEWORK_GROUPS)[number]["key"];
export const HOMEWORK_GROUP_KEYS = HOMEWORK_GROUPS.map((group) => group.key) as [HomeworkGroupKey, ...HomeworkGroupKey[]];

export type UploadPurpose = "video" | "document" | "captions";

type FileFormat = { mime: string; extensions: string[]; label: string };

const MEGABYTE = 1024 * 1024;
const KILOBYTE = 1024;
const SECONDS_PER_MINUTE = 60;

export const UPLOAD_LIMIT_BYTES: Record<UploadPurpose, number> = {
  video: 50 * MEGABYTE,
  document: 20 * MEGABYTE,
  captions: 1 * MEGABYTE,
};

export const UPLOAD_FORMATS: Record<UploadPurpose, FileFormat[]> = {
  video: [{ mime: "video/mp4", extensions: ["mp4"], label: "MP4 video" }],
  document: [
    { mime: "application/pdf", extensions: ["pdf"], label: "PDF" },
    { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extensions: ["pptx"], label: "PowerPoint" },
    { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extensions: ["docx"], label: "Word" },
    { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extensions: ["xlsx"], label: "Excel" },
  ],
  captions: [{ mime: "text/vtt", extensions: ["vtt"], label: "Captions" }],
};

const ALL_FORMATS = Object.values(UPLOAD_FORMATS).flat();

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/** The accepted format for a file name, judged by its extension (browsers report some types unreliably). */
export function getUploadFormat(purpose: UploadPurpose, fileName: string): FileFormat | null {
  const extension = getExtension(fileName);
  return UPLOAD_FORMATS[purpose].find((format) => format.extensions.includes(extension)) ?? null;
}

/** Why a file can't be uploaded for this purpose, or null when it can. */
export function getUploadProblem({ purpose, fileName, sizeBytes }: { purpose: UploadPurpose; fileName: string; sizeBytes: number }): string | null {
  const format = getUploadFormat(purpose, fileName);
  const allowed = UPLOAD_FORMATS[purpose].map((candidate) => candidate.label).join(", ");
  if (!format) return `This file type isn't accepted here. Accepted: ${allowed}.`;
  if (sizeBytes <= 0) return "This file is empty. Choose another file.";
  if (sizeBytes > UPLOAD_LIMIT_BYTES[purpose]) return `This file is larger than ${getFileSizeLabel(UPLOAD_LIMIT_BYTES[purpose])}. Choose a smaller file.`;
  return null;
}

/** 1370000 → "1.3 MB", 419369 → "410 KB" */
export function getFileSizeLabel(sizeBytes: number): string {
  if (sizeBytes >= MEGABYTE) return `${(sizeBytes / MEGABYTE).toFixed(1).replace(/\.0$/, "")} MB`;
  return `${Math.max(1, Math.round(sizeBytes / KILOBYTE))} KB`;
}

/** 283 → "4:43" */
export function getDurationLabel(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainder = Math.round(seconds % SECONDS_PER_MINUTE);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

/** "PDF", "PowerPoint", … for a stored file's type. */
export function getFormatLabel(mime: string): string {
  return ALL_FORMATS.find((format) => format.mime === mime)?.label ?? "File";
}

/** Button wording: "Download PDF", or "Descargar PowerPoint" for Spanish guides. */
export function getDownloadLabel({ mime, isSpanish }: { mime: string; isSpanish: boolean }): string {
  return `${isSpanish ? "Descargar" : "Download"} ${getFormatLabel(mime)}`;
}

export function getGroupLabel(key: HomeworkGroupKey): string {
  return HOMEWORK_GROUPS.find((group) => group.key === key)?.label ?? key;
}
