"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { createSignedUploads, PhotoStorageError, type SignedUpload } from "@/lib/admin/photos/photo-storage";
import { getAlreadyReportedCause, getReportedFailureMessage, getUnexpectedCause } from "@/lib/admin/report-action-failure";
import { AdminAccessError, EDITOR_ROLES, requireAdmin } from "@/lib/admin/require-admin";
import { noteProblemCause, runInActionContext, type ProblemCause } from "@/lib/observability/action-context";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { ReportedProblemError } from "@/lib/observability/reported-problem-error";

// Step 2 of an admin photo upload: after checking the editor and the record, hand out
// one-time upload links for a fresh folder (the Phase 2 photo file layout). Not wrapped by
// runAdminAction (it returns a ticket), so it records its own failures the same way.

const PROBLEM_ACTION: ProblemAction = "photos.request_upload_link";
const BAD_TARGET_MESSAGE = "That item couldn't be found.";
const MISSING_MESSAGE = "That item couldn't be found. It may have been deleted.";
const LOAD_FAILED_MESSAGE = "We couldn't load this item. Try again in a moment.";
const UPLOADS_DOWN_MESSAGE = "Uploads aren't working right now. Try again in a moment.";

const photoTargetSchema = z.object({
  kind: z.enum(["listing", "team", "connection", "homework"]),
  recordId: z.uuid(),
});

export type PhotoTarget = z.infer<typeof photoTargetSchema>;

export type PhotoUploadTicket =
  | { status: "ready"; folder: string; uploads: SignedUpload[] }
  | { status: "error"; message: string };

const TARGET_TABLES: Record<PhotoTarget["kind"], string> = { listing: "listings", team: "team_members", connection: "connections", homework: "homework_items" };
const TARGET_FOLDERS: Record<PhotoTarget["kind"], string> = { listing: "listings", team: "team", connection: "connections", homework: "homework" };

function getTicketError(message: string): PhotoUploadTicket {
  return { status: "error", message };
}

function getStorageCause(error: PhotoStorageError): ProblemCause {
  const cause = error.context.cause instanceof Error ? error.context.cause : null;
  return { stage: "storage", severity: "error", code: cause?.name || error.name, detail: cause ? `${error.message}: ${cause.message}` : error.message };
}

function getThrownCause(error: unknown): ProblemCause {
  if (error instanceof ReportedProblemError) return getAlreadyReportedCause(error);
  if (error instanceof AdminAccessError) return { stage: "access", severity: "warning", code: "wrong_role", detail: null };
  if (error instanceof PhotoStorageError) return getStorageCause(error);
  return getUnexpectedCause(error);
}

function getThrownMessage(error: unknown): string {
  if (error instanceof ReportedProblemError || error instanceof AdminAccessError) return error.message;
  return UPLOADS_DOWN_MESSAGE;
}

async function fetchUploadTicket(target: PhotoTarget): Promise<PhotoUploadTicket> {
  const parsed = photoTargetSchema.safeParse(target);
  if (!parsed.success) {
    noteProblemCause({ stage: "validate", severity: "info", code: "ZodError", detail: parsed.error.issues[0]?.message ?? null });
    return getTicketError(BAD_TARGET_MESSAGE);
  }
  const { supabase, tenantId } = await requireAdmin(EDITOR_ROLES);
  const { data: record, error } = await supabase.from(TARGET_TABLES[parsed.data.kind]).select("id").eq("id", parsed.data.recordId).eq("tenant_id", tenantId).maybeSingle();
  if (error) {
    noteProblemCause({ stage: "load", severity: "error", code: error.code ?? "database", detail: error.message });
    return getTicketError(LOAD_FAILED_MESSAGE);
  }
  if (!record) {
    noteProblemCause({ stage: "not_found", severity: "info", code: parsed.data.kind, detail: null });
    return getTicketError(MISSING_MESSAGE);
  }
  const folder = `${TARGET_FOLDERS[parsed.data.kind]}/${parsed.data.recordId}/${crypto.randomUUID()}`;
  return { status: "ready", folder, uploads: await createSignedUploads(folder) };
}

async function getUploadTicket(target: PhotoTarget): Promise<PhotoUploadTicket> {
  try {
    return await fetchUploadTicket(target);
  } catch (error) {
    unstable_rethrow(error);
    noteProblemCause(getThrownCause(error));
    return getTicketError(getThrownMessage(error));
  }
}

export async function requestPhotoUploadAction(target: PhotoTarget): Promise<PhotoUploadTicket> {
  return runInActionContext(PROBLEM_ACTION, async () => {
    const ticket = await getUploadTicket(target);
    if (ticket.status === "ready") return ticket;
    return getTicketError(await getReportedFailureMessage({ action: PROBLEM_ACTION, message: ticket.message, hasFieldErrors: false }));
  });
}
