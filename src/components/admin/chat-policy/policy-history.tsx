"use client";

import { History } from "lucide-react";

import { usePolicyDraftState } from "@/components/admin/chat-policy/policy-draft-state";
import { QuickActionButton } from "@/components/admin/quick-action-button";
import { IDLE_ACTION_STATE } from "@/lib/admin/action-state";
import { restorePolicyVersionAction, savePolicyDraftAction, type RestoreResult } from "@/lib/admin/chat-policy/actions";
import { SAVE_FIRST_REASON, getRestoreState } from "@/lib/admin/chat-policy/test-rows";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";

// Admin §6 "version history with one click restore". Restoring copies an old version into the
// open draft (or a new draft when none is open), so history is never rewritten and the live
// version changes only on publish. Undo puts the open draft's earlier text back
// (docs/cwr-chatbot-round-3-plan.md, bugs 11–14).

const UNDONE_MESSAGE = "Your draft's earlier text is back. Run the tests again before publishing.";

/** whenLabel: the row's status and date in words, for example "Draft · last saved Oct 5, 2026". */
export type PolicyVersionRow = { id: string; version: number; whenLabel: string; isWorkingDraft: boolean };

/** Undo: saves the earlier text over the draft the restore replaced, only if nothing changed it since. */
async function fetchUndoneRestore({ restored, previousText }: { restored: RestoreResult; previousText: string }): Promise<QuickResult> {
  const formData = new FormData();
  formData.set("draftId", restored.draftId ?? "");
  formData.set("expectedUpdatedAt", restored.updatedAt ?? "");
  formData.set("body", previousText);
  const state = await savePolicyDraftAction(IDLE_ACTION_STATE, formData);
  return state.status === "success" ? getQuickSuccess(UNDONE_MESSAGE) : getQuickError(state.message);
}

function RestoreButton({ row, hasOpenDraft }: { row: PolicyVersionRow; hasOpenDraft: boolean }) {
  const { hasUnsavedChanges, unsavedChangesRef, isRunning, savedDraftText } = usePolicyDraftState();
  const restoreState = getRestoreState({ hasUnsavedChanges, isRunning, isWorkingDraft: row.isWorkingDraft });
  if (!restoreState.isShown) return null;
  // Copied at render, which is before the click: after the restore, the page shows the restored text.
  const previousText = savedDraftText ?? "";
  const runUndo = async (restored: RestoreResult) => (unsavedChangesRef.current ? getQuickError(SAVE_FIRST_REASON) : fetchUndoneRestore({ restored, previousText }));
  return (
    <QuickActionButton<RestoreResult>
      label="Restore"
      accessibleLabel={hasOpenDraft ? `Restore version ${row.version} into your open draft` : `Restore version ${row.version} as a new draft`}
      icon={History}
      problemAction="chat_policy.restore_version"
      onRun={() => restorePolicyVersionAction(row.id)}
      undo={{ label: "Undo", problemAction: "chat_policy.save_draft", onRun: runUndo, isOffered: (restored) => restored.didReplace === true }}
      isDisabled={restoreState.isDisabled}
    />
  );
}

export function PolicyHistory({ versions }: { versions: PolicyVersionRow[] }) {
  const hasOpenDraft = versions.some((version) => version.isWorkingDraft);
  return (
    <ul className="max-w-prose border-b border-line">
      {versions.map((version) => (
        <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
          <p>
            <span className="font-semibold">{`Version ${version.version}`}</span>
            <span className="type-small text-muted">{` · ${version.whenLabel}`}</span>
          </p>
          <RestoreButton row={version} hasOpenDraft={hasOpenDraft} />
        </li>
      ))}
    </ul>
  );
}
