"use client";

import { CircleCheck, RotateCcw, UserCheck } from "lucide-react";
import { useId, useRef } from "react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { assignThreadAction, setThreadStatusAction } from "@/lib/admin/inbox/actions";
import type { InboxStatus } from "@/lib/admin/inbox/inbox-labels";

type ThreadControlsProps = {
  threadId: string;
  status: InboxStatus;
  assigneeId: string | null;
  teammates: { userId: string; label: string }[] | null;
};

function AssignControl({ threadId, assigneeId, teammates }: { threadId: string; assigneeId: string | null; teammates: { userId: string; label: string }[] }) {
  const selectId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  return (
    <div className="grid gap-2 md:flex md:items-end md:gap-3">
      <div>
        <label htmlFor={selectId} className="mb-1 block text-base font-bold">
          Assigned to
        </label>
        <select id={selectId} ref={selectRef} defaultValue={assigneeId ?? teammates[0]?.userId} className="field-input">
          {teammates.map((teammate) => (
            <option key={teammate.userId} value={teammate.userId}>
              {teammate.label}
            </option>
          ))}
        </select>
      </div>
      <QuickActionButton label="Assign" accessibleLabel="Assign this message" icon={UserCheck} onRun={() => assignThreadAction(threadId, selectRef.current?.value ?? "")} />
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
          assigneeId && <QuickActionButton label="Reopen" accessibleLabel="Reopen this conversation" icon={RotateCcw} onRun={() => setThreadStatusAction(threadId, "assigned")} />
        ) : (
          <QuickActionButton
            label="Close"
            accessibleLabel="Close this conversation"
            icon={CircleCheck}
            onRun={() => setThreadStatusAction(threadId, "closed")}
            undo={assigneeId ? { label: "Undo", onRun: () => setThreadStatusAction(threadId, "assigned") } : undefined}
          />
        )}
      </div>
    </div>
  );
}
