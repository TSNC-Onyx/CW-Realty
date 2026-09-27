import { z } from "zod";

import { HOMEWORK_GROUP_KEYS } from "@/lib/content/homework-rules";

// Homework item rules for Admin → Homework; they mirror the database checks in
// migration 20260927000100_cwr_homework.sql.

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_LINK_LENGTH = 500;
const SECURE_WEB_ADDRESS = /^https:\/\/\S+$/i;
const MAX_FILE_NAME_LENGTH = 120;

const checkbox = z.string().optional().transform((value) => value === "on");

const sharedDetails = {
  title: z.string().trim().min(1, "Enter a title").max(MAX_TITLE_LENGTH, "Keep the title under 200 characters"),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH, "Keep the description under 500 characters"),
  isSpanish: checkbox,
};

const linkUrl = z
  .string()
  .trim()
  .max(MAX_LINK_LENGTH, "Keep the web address under 500 characters")
  .refine((value) => SECURE_WEB_ADDRESS.test(value), "Enter a full web address starting with https://");

export const videoDetailsSchema = z.object({ ...sharedDetails, isVisible: checkbox });

export const downloadDetailsSchema = z
  .object({
    ...sharedDetails,
    isVisible: checkbox,
    groupKey: z.enum(HOMEWORK_GROUP_KEYS, "Choose a group"),
    delivery: z.enum(["file", "link"], "Choose what visitors get"),
    linkUrl: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (values.delivery !== "link") return;
    const parsed = linkUrl.safeParse(values.linkUrl);
    if (!parsed.success) context.addIssue({ code: "custom", path: ["linkUrl"], message: parsed.error.issues[0]?.message ?? "Check the web address" });
  });

export type VideoDetailsInput = z.infer<typeof videoDetailsSchema>;
export type DownloadDetailsInput = z.infer<typeof downloadDetailsSchema>;

export function getVideoRow(input: VideoDetailsInput) {
  return { title: input.title, description: input.description, is_spanish: input.isSpanish };
}

export function getDownloadRow(input: DownloadDetailsInput) {
  const isLink = input.delivery === "link";
  return {
    kind: input.delivery,
    group_key: input.groupKey,
    title: input.title,
    description: input.description,
    is_spanish: input.isSpanish,
    link_url: isLink ? input.linkUrl : null,
  };
}

/** "Four Basic Steps (Final).PDF" → "four-basic-steps-final.pdf": safe in a storage path, still readable. */
export function getStorageFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  const base = (dot >= 0 ? fileName.slice(0, dot) : fileName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_FILE_NAME_LENGTH);
  return `${base || "file"}.${extension}`;
}
