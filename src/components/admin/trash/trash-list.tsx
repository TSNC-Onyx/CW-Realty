"use client";

import { RotateCcw, Trash2 } from "lucide-react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { deleteForeverAction, restoreFromTrashAction, type TrashTarget } from "@/lib/admin/trash/actions";

export type TrashListItem = { id: string; table: TrashTarget["table"]; typeLabel: string; label: string; deletedOn: string; purgeOn: string };

// Restore: owners and managers. Delete forever: owners only (parent plan role table).
export function TrashList({ items, canDeleteForever }: { items: TrashListItem[]; canDeleteForever: boolean }) {
  return (
    <ul className="border-b border-line">
      {items.map((item) => (
        <li key={`${item.table}-${item.id}`} className="grid gap-3 border-t border-line py-4 md:grid-cols-12 md:items-center">
          <div className="md:col-span-7">
            <p className="font-bold">{item.label}</p>
            <p className="type-small text-muted">{`${item.typeLabel} · deleted ${item.deletedOn} · removed for good on ${item.purgeOn}`}</p>
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-5 md:justify-end">
            <QuickActionButton label="Restore" accessibleLabel={`Restore ${item.label}`} icon={RotateCcw} onRun={() => restoreFromTrashAction({ table: item.table, id: item.id })} />
            {canDeleteForever && (
              <QuickActionButton label="Delete forever" accessibleLabel={`Delete ${item.label} forever`} icon={Trash2} onRun={() => deleteForeverAction({ table: item.table, id: item.id })} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
