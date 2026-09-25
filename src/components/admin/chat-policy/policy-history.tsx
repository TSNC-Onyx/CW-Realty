"use client";

import { History } from "lucide-react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { restorePolicyVersionAction } from "@/lib/admin/chat-policy/actions";

// Admin §6 "version history with one click restore": restoring copies an old version into a
// new draft, so history is never rewritten and the live version changes only on publish.

export type PolicyVersionRow = { id: string; version: number; statusLabel: string; when: string };

export function PolicyHistory({ versions }: { versions: PolicyVersionRow[] }) {
  return (
    <ul className="max-w-prose border-b border-line">
      {versions.map((version) => (
        <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
          <p>
            <span className="font-semibold">{`Version ${version.version}`}</span>
            <span className="type-small text-muted">{` · ${version.statusLabel} · ${version.when}`}</span>
          </p>
          <QuickActionButton label="Restore" accessibleLabel={`Restore version ${version.version} as a new draft`} icon={History} onRun={() => restorePolicyVersionAction(version.id)} />
        </li>
      ))}
    </ul>
  );
}
