"use client";

import { CircleCheck, RotateCcw, UserCheck } from "lucide-react";
import { useId, useRef } from "react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { SavedStateLine, useTypedValue } from "@/components/admin/saved-state";
import { assignThreadAction, setThreadStatusAction } from "@/lib/admin/inbox/actions";
import type { InboxStatus } from "@/lib/admin/inbox/inbox-labels";
import { getSavedState } from "@/lib/admin/saved-state";

type ThreadControlsProps = {
  threadId: string;
  status: InboxStatus;
  assigneeId: string | null;
  teammates: { userId: string; label: string }[] | null;
};

function AssignControl({ threadId, assigneeId, teammates }: { threadId: string; assigneeId: string | null; teammates: { userId: string; label: string }[] }) {
  const selectId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  // An unassigned conversation still shows the first teammate, ready to assign.
  const shownAssignee = assigneeId ?? teammates[0]?.userId ?? "";
  const [typedAssignee, setTypedAssignee] = useTypedValue(shownAssignee);
  const savedState = getSavedState({ current: typedAssignee, saved: shownAssignee, isSavedBlank: assigneeId === null });
  return (
    <div className="grid gap-2 md:flex md:items-end md:gap-3">
      <div>
        <label htmlFor={selectId} className="mb-1 block text-base font-bold">
          Assigned to
        </label>
        <select
          key={shownAssignee}
          id={selectId}
          ref={selectRef}
          defaultValue={shownAssignee}
          onChange={(event) => setTypedAssignee(event.target.value)}
          aria-describedby={`${selectId}-saved`}
          className="field-input"
        >
          {teammates.map((teammate) => (
            <option key={teammate.userId} value={teammate.userId}>
              {teammate.label}
            </option>
          ))}
        </select>
        <SavedStateLine id={`${selectId}-saved`} state={savedState} getText={(state) => (state === "empty" ? "Not assigned yet" : null)} />
      </div>
      <QuickActionButton label="Assign" accessibleLabel="Assign this message" icon={UserCheck} problemAction="inbox.assign" onRun={() => assignThreadAction(threadId, selectRef.current?.value ?? "")} />
    </div>
  );
}

// Assign (owners and managers), close, and reopen — Admin §5.
export function ThreadControls({ threadId, status, assigneeId, teammates }: ThreadControlsProps) {
  const isClosed = status === "closed";
  return (
    <div className="grid gap-4">
      {teammates && <AssignControl threadId={threadId} assigneeId={assigneeId} teammates={teammates} />}
      <div>
        {isClosed ? (
          assigneeId && <QuickActionButton label="Reopen" accessibleLabel="Reopen this conversation" icon={RotateCcw} problemAction="inbox.set_status" onRun={() => setThreadStatusAction(threadId, "assigned")} />
        ) : (
          <QuickActionButton
            label="Close"
            accessibleLabel="Close this conversation"
            icon={CircleCheck}
            problemAction="inbox.set_status"
            onRun={() => setThreadStatusAction(threadId, "closed")}
            undo={assigneeId ? { label: "Undo", problemAction: "inbox.set_status", onRun: () => setThreadStatusAction(threadId, "assigned") } : undefined}
          />
        )}
      </div>
    </div>
  );
}
