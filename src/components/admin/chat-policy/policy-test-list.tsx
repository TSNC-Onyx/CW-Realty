"use client";

import { Trash2 } from "lucide-react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { removePolicyTestAction, restorePolicyTestAction } from "@/lib/admin/chat-policy/actions";
import type { ChatOutcome } from "@/lib/chat/assistant-reply";

export type PolicyTestRow = { id: string; question: string; expectedOutcome: ChatOutcome; expectedSection: string | null };

const OUTCOME_LABELS: Record<ChatOutcome, string> = { answer: "Should answer", handoff: "Should hand off to a person" };

export function PolicyTestList({ tests }: { tests: PolicyTestRow[] }) {
  return (
    <ul className="max-w-prose border-b border-line">
      {tests.map((test) => (
        <li key={test.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-line py-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{test.question}</p>
            <p className="type-small text-muted">{`${OUTCOME_LABELS[test.expectedOutcome]}${test.expectedSection ? ` · cites “${test.expectedSection}”` : ""}`}</p>
          </div>
          <QuickActionButton
            label="Remove"
            accessibleLabel={`Remove test question: ${test.question}`}
            icon={Trash2}
            onRun={() => removePolicyTestAction(test.id)}
            undo={{ label: "Undo", onRun: () => restorePolicyTestAction({ question: test.question, expectedOutcome: test.expectedOutcome, expectedSection: test.expectedSection ?? "" }) }}
          />
        </li>
      ))}
    </ul>
  );
}
