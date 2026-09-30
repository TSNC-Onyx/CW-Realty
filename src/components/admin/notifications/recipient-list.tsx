"use client";

import { BellOff, BellRing, ShieldAlert, ShieldOff, Trash2 } from "lucide-react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { SOURCE_LABELS, type InboxSource } from "@/lib/admin/inbox/inbox-labels";
import { removeRecipientAction, restoreRecipientAction, setRecipientActiveAction, setRecipientProblemAlertsAction } from "@/lib/admin/notifications/actions";

export type RecipientItem = { id: string; fullName: string; email: string; sources: InboxSource[]; isActive: boolean; getsProblemAlerts: boolean };

type RecipientListProps = {
  recipients: RecipientItem[];
  /** Only owners choose who gets problem emails; managers see who does. */
  isOwner: boolean;
};

function ProblemAlertsButton({ recipient }: { recipient: RecipientItem }) {
  const isOn = recipient.getsProblemAlerts;
  return (
    <QuickActionButton
      label={isOn ? "Stop problem emails" : "Send problem emails"}
      accessibleLabel={`${isOn ? "Stop sending" : "Send"} problem emails to ${recipient.fullName}`}
      icon={isOn ? ShieldOff : ShieldAlert}
      problemAction="notifications.set_recipient_problem_alerts"
      onRun={() => setRecipientProblemAlertsAction(recipient.id, !isOn)}
    />
  );
}

export function RecipientList({ recipients, isOwner }: RecipientListProps) {
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
            {recipient.getsProblemAlerts && <p className="type-small font-semibold">Gets problem emails</p>}
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-5 md:justify-end">
            {isOwner && <ProblemAlertsButton recipient={recipient} />}
            <QuickActionButton
              label={recipient.isActive ? "Pause" : "Resume"}
              accessibleLabel={`${recipient.isActive ? "Pause" : "Resume"} alerts for ${recipient.fullName}`}
              icon={recipient.isActive ? BellOff : BellRing}
              problemAction="notifications.set_recipient_active"
              onRun={() => setRecipientActiveAction(recipient.id, !recipient.isActive)}
            />
            <QuickActionButton
              label="Remove"
              accessibleLabel={`Stop alerts for ${recipient.fullName}`}
              icon={Trash2}
              problemAction="notifications.remove_recipient"
              onRun={() => removeRecipientAction(recipient.id)}
              undo={{
                label: "Undo",
                problemAction: "notifications.restore_recipient",
                onRun: () => restoreRecipientAction({ fullName: recipient.fullName, email: recipient.email, alertSources: recipient.sources, getsProblemAlerts: recipient.getsProblemAlerts }),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
