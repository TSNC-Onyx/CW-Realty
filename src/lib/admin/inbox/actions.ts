"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { ALL_ROLES, EDITOR_ROLES, type AdminContext } from "@/lib/admin/require-admin";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { enqueueAlertJob, type EnqueueOutcome } from "@/lib/jobs/enqueue-alert-job";
import { noteProblemCause } from "@/lib/observability/action-context";
import type { ProblemSeverity } from "@/lib/observability/problem-types";
import { getReferenceSuffix } from "@/lib/observability/reference";
import { reportProblem } from "@/lib/observability/report-problem";

// Inbox actions (Admin §5). Row Level Security decides which threads each person can touch;
// every status change goes through the workflow engine (Infra §4).

const INBOX_PATH = "/admin/inbox";
const THREADS_TABLE = "inbox_threads";
const MAX_TEXT_LENGTH = 20000;
const MISSING_THREAD_MESSAGE = "That message no longer exists.";
const THREAD_LOAD_FAILED_MESSAGE = "We couldn't load this message. Try again in a moment.";
const ASSIGN_UNDONE_MESSAGE = "Couldn't assign it, so nothing was changed. Try again in a moment.";
const ASSIGN_HALF_DONE_MESSAGE = "It was assigned, but its status didn't update and couldn't be put back. Tell the site owner.";
const REPLY_SENT_MESSAGE = "Reply sent. It's saved in this conversation.";
const REPLY_NOT_SENT_MESSAGE = "Reply saved. The email hasn't gone out yet — it will retry; check Notifications";
const REPLY_EMAIL_NOT_SET_UP_MESSAGE = "Reply saved. Email sending isn't set up yet, so it wasn't emailed";

const textSchema = z.string().trim().min(1, "Write something first").max(MAX_TEXT_LENGTH, "Keep it under 20,000 characters");
const statusSchema = z.enum(["assigned", "replied", "closed"]);

type ThreadState = { status: string; assignee_id: string | null; contact_email: string | null };

type ThreadLookup = { isFound: true; thread: ThreadState } | { isFound: false; message: string };

type DatabaseError = { code?: string; message: string };

type AssignProblem = { severity: ProblemSeverity; shownMessage: string };

function refreshInbox(threadId: string): void {
  revalidatePath(INBOX_PATH);
  revalidatePath(`${INBOX_PATH}/${threadId}`);
}

function getReplySentMessage(outcome: EnqueueOutcome): string {
  if (outcome.status === "queued" || outcome.status === "sent") return REPLY_SENT_MESSAGE;
  const message = outcome.status === "not_set_up" ? REPLY_EMAIL_NOT_SET_UP_MESSAGE : REPLY_NOT_SENT_MESSAGE;
  return outcome.reference ? `${message} (Ref ${outcome.reference}).` : `${message}.`;
}

/** A load error is not "no longer exists": only a truly missing row says that. */
async function fetchThreadState({ supabase, tenantId }: AdminContext, threadId: string): Promise<ThreadLookup> {
  const { data, error } = await supabase.from(THREADS_TABLE).select("status, assignee_id, contact_email").eq("id", threadId).eq("tenant_id", tenantId).maybeSingle<ThreadState>();
  if (error) {
    noteProblemCause({ stage: "load", severity: "error", code: error.code ?? "load", detail: error.message });
    return { isFound: false, message: THREAD_LOAD_FAILED_MESSAGE };
  }
  return data ? { isFound: true, thread: data } : { isFound: false, message: MISSING_THREAD_MESSAGE };
}

async function moveThread({ supabase }: AdminContext, { threadId, toState }: { threadId: string; toState: string }) {
  return supabase.rpc("transition", { p_workflow_key: "inbox_status", p_record_id: threadId, p_to_state: toState });
}

async function setAssignee({ supabase, tenantId }: AdminContext, { threadId, assigneeId }: { threadId: string; assigneeId: string | null }) {
  return supabase.from(THREADS_TABLE).update({ assignee_id: assigneeId }).eq("id", threadId).eq("tenant_id", tenantId);
}

/** Records a failed assignment against the thread and shows its reference. */
async function getReportedAssignError({ threadId, moveError, problem }: { threadId: string; moveError: DatabaseError; problem: AssignProblem }): Promise<QuickResult> {
  const detail = `Status change failed after the assignee was changed: ${moveError.message}`;
  const result = await reportProblem({ action: "inbox.assign", stage: "database", severity: problem.severity, code: moveError.code ?? "transition", detail, shownMessage: problem.shownMessage, recordTable: THREADS_TABLE, recordId: threadId });
  noteProblemCause({ stage: "database", severity: problem.severity, code: moveError.code ?? "transition", detail: null, reference: result.reference });
  return getQuickError(`${problem.shownMessage}${getReferenceSuffix({ reference: result.reference, isStored: result.stored === true })}`);
}

/** The status step failed: put the old assignee back so nothing is left half-finished. */
async function undoAssignment(admin: AdminContext, { threadId, previousAssigneeId, moveError }: { threadId: string; previousAssigneeId: string | null; moveError: DatabaseError }): Promise<QuickResult> {
  const { error: restoreError } = await setAssignee(admin, { threadId, assigneeId: previousAssigneeId });
  if (!restoreError) return getReportedAssignError({ threadId, moveError, problem: { severity: "warning", shownMessage: ASSIGN_UNDONE_MESSAGE } });
  refreshInbox(threadId);
  const halfDoneError = { code: moveError.code, message: `${moveError.message}; restoring the assignee also failed: ${restoreError.message}` };
  return getReportedAssignError({ threadId, moveError: halfDoneError, problem: { severity: "critical", shownMessage: ASSIGN_HALF_DONE_MESSAGE } });
}

/** The reply is saved and sent; a status that didn't follow is recorded, not shown. */
async function markThreadReplied(admin: AdminContext, { threadId, status }: { threadId: string; status: string }): Promise<void> {
  if (status === "replied" || status === "closed") return;
  const { error } = await moveThread(admin, { threadId, toState: "replied" });
  if (!error) return;
  await reportProblem({ action: "inbox.send_reply", stage: "database", severity: "warning", code: error.code ?? "transition", detail: `Reply saved but status not updated: ${error.message}`, recordTable: THREADS_TABLE, recordId: threadId });
}

export async function assignThreadAction(threadId: string, assigneeId: string): Promise<QuickResult> {
  return runQuickAction({ action: "inbox.assign", roles: EDITOR_ROLES }, async (admin) => {
    const id = z.uuid().parse(threadId);
    const lookup = await fetchThreadState(admin, id);
    if (!lookup.isFound) return getQuickError(lookup.message);
    const { error } = await setAssignee(admin, { threadId: id, assigneeId: z.uuid().parse(assigneeId) });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    const shouldMarkAssigned = lookup.thread.status === "new" || lookup.thread.status === "closed";
    if (shouldMarkAssigned) {
      const { error: moveError } = await moveThread(admin, { threadId: id, toState: "assigned" });
      if (moveError) return undoAssignment(admin, { threadId: id, previousAssigneeId: lookup.thread.assignee_id, moveError });
    }
    refreshInbox(id);
    return getQuickSuccess("Assigned. They'll see it in their inbox.");
  });
}

export async function addNoteAction(threadId: string, note: string): Promise<QuickResult> {
  return runQuickAction({ action: "inbox.add_note", roles: ALL_ROLES }, async ({ supabase, tenantId, userId }) => {
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
  return runQuickAction({ action: "inbox.send_reply", roles: ALL_ROLES }, async (admin) => {
    const id = z.uuid().parse(threadId);
    const body = textSchema.safeParse(reply);
    if (!body.success) return getQuickError(body.error.issues[0]?.message ?? "Write a reply first");
    const lookup = await fetchThreadState(admin, id);
    if (!lookup.isFound) return getQuickError(lookup.message);
    if (!lookup.thread.contact_email) return getQuickError("This person didn't leave an email address. Call or text them instead.");
    const { data: message, error } = await admin.supabase
      .from("inbox_messages")
      .insert({ tenant_id: admin.tenantId, thread_id: id, kind: "reply", body: body.data, author_id: admin.userId })
      .select("id")
      .single<{ id: string }>();
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    const outcome = await enqueueAlertJob({ kind: "reply", messageId: message.id });
    await markThreadReplied(admin, { threadId: id, status: lookup.thread.status });
    refreshInbox(id);
    return getQuickSuccess(getReplySentMessage(outcome));
  });
}

export async function setThreadStatusAction(threadId: string, toState: string): Promise<QuickResult> {
  return runQuickAction({ action: "inbox.set_status", roles: ALL_ROLES }, async (admin) => {
    const id = z.uuid().parse(threadId);
    const { error } = await moveThread(admin, { threadId: id, toState: statusSchema.parse(toState) });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    refreshInbox(id);
    return getQuickSuccess(toState === "closed" ? "Closed. You can reopen it any time." : "Reopened.");
  });
}
