"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { ALL_ROLES, EDITOR_ROLES, type AdminContext } from "@/lib/admin/require-admin";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { enqueueAlertJob } from "@/lib/jobs/enqueue-alert-job";

// Inbox actions (Admin §5). Row Level Security decides which threads each person can touch;
// every status change goes through the workflow engine (Infra §4).

const INBOX_PATH = "/admin/inbox";
const MAX_TEXT_LENGTH = 20000;

const textSchema = z.string().trim().min(1, "Write something first").max(MAX_TEXT_LENGTH, "Keep it under 20,000 characters");
const statusSchema = z.enum(["assigned", "replied", "closed"]);

type ThreadState = { status: string; assignee_id: string | null; contact_email: string | null };

function refreshInbox(threadId: string): void {
  revalidatePath(INBOX_PATH);
  revalidatePath(`${INBOX_PATH}/${threadId}`);
}

async function fetchThreadState({ supabase, tenantId }: AdminContext, threadId: string): Promise<ThreadState | null> {
  const { data } = await supabase.from("inbox_threads").select("status, assignee_id, contact_email").eq("id", threadId).eq("tenant_id", tenantId).maybeSingle<ThreadState>();
  return data;
}

async function moveThread({ supabase }: AdminContext, { threadId, toState }: { threadId: string; toState: string }) {
  return supabase.rpc("transition", { p_workflow_key: "inbox_status", p_record_id: threadId, p_to_state: toState });
}

export async function assignThreadAction(threadId: string, assigneeId: string): Promise<QuickResult> {
  return runQuickAction(EDITOR_ROLES, async (admin) => {
    const id = z.uuid().parse(threadId);
    const thread = await fetchThreadState(admin, id);
    if (!thread) return getQuickError("That message no longer exists.");
    const { error } = await admin.supabase.from("inbox_threads").update({ assignee_id: z.uuid().parse(assigneeId) }).eq("id", id).eq("tenant_id", admin.tenantId);
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    const shouldMarkAssigned = thread.status === "new" || thread.status === "closed";
    if (shouldMarkAssigned) {
      const { error: moveError } = await moveThread(admin, { threadId: id, toState: "assigned" });
      if (moveError) return getQuickError(getDatabaseErrorMessage(moveError));
    }
    refreshInbox(id);
    return getQuickSuccess("Assigned. They'll see it in their inbox.");
  });
}

export async function addNoteAction(threadId: string, note: string): Promise<QuickResult> {
  return runQuickAction(ALL_ROLES, async ({ supabase, tenantId, userId }) => {
    const id = z.uuid().parse(threadId);
    const body = textSchema.safeParse(note);
    if (!body.success) return getQuickError(body.error.issues[0]?.message ?? "Write a note first");
    const { error } = await supabase.from("inbox_messages").insert({ tenant_id: tenantId, thread_id: id, kind: "internal_note", body: body.data, author_id: userId });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshInbox(id);
    return getQuickSuccess("Note added. Only your team can see it.");
  });
}

export async function sendReplyAction(threadId: string, reply: string): Promise<QuickResult> {
  return runQuickAction(ALL_ROLES, async (admin) => {
    const id = z.uuid().parse(threadId);
    const body = textSchema.safeParse(reply);
    if (!body.success) return getQuickError(body.error.issues[0]?.message ?? "Write a reply first");
    const thread = await fetchThreadState(admin, id);
    if (!thread) return getQuickError("That message no longer exists.");
    if (!thread.contact_email) return getQuickError("This person didn't leave an email address. Call or text them instead.");
    const { data: message, error } = await admin.supabase
      .from("inbox_messages")
      .insert({ tenant_id: admin.tenantId, thread_id: id, kind: "reply", body: body.data, author_id: admin.userId })
      .select("id")
      .single<{ id: string }>();
    if (error || !message) return getQuickError(error ? getDatabaseErrorMessage(error) : "The reply wasn't saved.");
    await enqueueAlertJob({ kind: "reply", messageId: message.id });
    if (thread.status !== "replied" && thread.status !== "closed") {
      const { error: moveError } = await moveThread(admin, { threadId: id, toState: "replied" });
      if (moveError) console.error(JSON.stringify({ message: "Reply sent but status not updated", threadId: id, code: moveError.code }));
    }
    refreshInbox(id);
    return getQuickSuccess("Reply sent. It's saved in this conversation.");
  });
}

export async function setThreadStatusAction(threadId: string, toState: string): Promise<QuickResult> {
  return runQuickAction(ALL_ROLES, async (admin) => {
    const id = z.uuid().parse(threadId);
    const { error } = await moveThread(admin, { threadId: id, toState: statusSchema.parse(toState) });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshInbox(id);
    return getQuickSuccess(toState === "closed" ? "Closed. You can reopen it any time." : "Reopened.");
  });
}
