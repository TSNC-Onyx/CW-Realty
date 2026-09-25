"use client";

import { BellOff, BellRing, Trash2 } from "lucide-react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { SOURCE_LABELS, type InboxSource } from "@/lib/admin/inbox/inbox-labels";
import { removeRecipientAction, restoreRecipientAction, setRecipientActiveAction } from "@/lib/admin/notifications/actions";

export type RecipientItem = { id: string; fullName: string; email: string; sources: InboxSource[]; isActive: boolean };

export function RecipientList({ recipients }: { recipients: RecipientItem[] }) {
  return (
    <ul className="border-b border-line">
      {recipients.map((recipient) => (
        <li key={recipient.id} className="grid gap-3 border-t border-line py-4 md:grid-cols-12 md:items-center">
          <div className="md:col-span-7">
            <p className="font-bold">{recipient.fullName}</p>
            <p className="type-small break-all text-muted">{recipient.email}</p>
            <p className="type-small text-muted">
              {recipient.isActive ? `Gets: ${recipient.sources.map((source) => SOURCE_LABELS[source]).join(", ")}` : "Alerts paused"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-5 md:justify-end">
            <QuickActionButton
              label={recipient.isActive ? "Pause" : "Resume"}
              accessibleLabel={`${recipient.isActive ? "Pause" : "Resume"} alerts for ${recipient.fullName}`}
              icon={recipient.isActive ? BellOff : BellRing}
              onRun={() => setRecipientActiveAction(recipient.id, !recipient.isActive)}
            />
            <QuickActionButton
              label="Remove"
              accessibleLabel={`Stop alerts for ${recipient.fullName}`}
              icon={Trash2}
              onRun={() => removeRecipientAction(recipient.id)}
              undo={{ label: "Undo", onRun: () => restoreRecipientAction({ fullName: recipient.fullName, email: recipient.email, alertSources: recipient.sources }) }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
