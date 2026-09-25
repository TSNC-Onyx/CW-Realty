"use server";

import { z } from "zod";

import { createSignedUploads, type SignedUpload } from "@/lib/admin/photos/photo-storage";
import { AdminAccessError, EDITOR_ROLES, requireAdmin } from "@/lib/admin/require-admin";

// Step 2 of an admin photo upload: after checking the editor and the record, hand out
// one-time upload links for a fresh folder (the Phase 2 photo file layout).

const photoTargetSchema = z.object({
  kind: z.enum(["listing", "team"]),
  recordId: z.uuid(),
});

export type PhotoTarget = z.infer<typeof photoTargetSchema>;

export type PhotoUploadTicket =
  | { status: "ready"; folder: string; uploads: SignedUpload[] }
  | { status: "error"; message: string };

const TARGET_TABLES: Record<PhotoTarget["kind"], string> = { listing: "listings", team: "team_members" };
const TARGET_FOLDERS: Record<PhotoTarget["kind"], string> = { listing: "listings", team: "team" };

export async function requestPhotoUploadAction(target: PhotoTarget): Promise<PhotoUploadTicket> {
  const parsed = photoTargetSchema.safeParse(target);
  if (!parsed.success) return { status: "error", message: "That item couldn't be found." };
  try {
    const { supabase, tenantId } = await requireAdmin(EDITOR_ROLES);
    const { data: record } = await supabase.from(TARGET_TABLES[parsed.data.kind]).select("id").eq("id", parsed.data.recordId).eq("tenant_id", tenantId).maybeSingle();
    if (!record) return { status: "error", message: "That item couldn't be found. It may have been deleted." };
    const folder = `${TARGET_FOLDERS[parsed.data.kind]}/${parsed.data.recordId}/${crypto.randomUUID()}`;
    return { status: "ready", folder, uploads: await createSignedUploads(folder) };
  } catch (error) {
    if (error instanceof AdminAccessError) return { status: "error", message: error.message };
    console.error("Photo upload links failed", error);
    return { status: "error", message: "Uploads aren't working right now. Try again in a moment." };
  }
}
