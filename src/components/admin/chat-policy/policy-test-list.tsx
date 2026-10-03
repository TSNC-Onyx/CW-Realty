"use client";

import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { removePolicyTestAction, restorePolicyTestAction } from "@/lib/admin/chat-policy/actions";
import type { ChatOutcome } from "@/lib/chat/assistant-reply";

export type PolicyTestRow = { id: string; question: string; expectedOutcome: ChatOutcome; expectedSection: string | null };

const OUTCOME_LABELS: Record<ChatOutcome, string> = { answer: "Should answer", handoff: "Should hand off to a person" };
// Past this many questions the list scrolls inside its own box, so the page stays short (owner request 2026-10-02).
const VISIBLE_QUESTIONS = 5;

/** A long list scrolls in a box about five questions tall; the box takes keyboard focus so arrow keys scroll it too. */
function TestListFrame({ count, children }: { count: number; children: ReactNode }) {
  if (count <= VISIBLE_QUESTIONS) return children;
  return (
    <>
      <p className="type-small mb-2 text-muted">{`${count} questions. Scroll the box to see them all.`}</p>
      <div role="region" aria-label={`Test questions, ${count} in all`} tabIndex={0} className="policy-test-scroll max-w-prose border border-line px-4">
        {children}
      </div>
    </>
  );
}

export function PolicyTestList({ tests }: { tests: PolicyTestRow[] }) {
  // Inside the box, rules go between questions only, so they don't double the box's own border.
  const isInBox = tests.length > VISIBLE_QUESTIONS;
  return (
    <TestListFrame count={tests.length}>
      <ul className={isInBox ? "divide-y divide-line" : "max-w-prose border-b border-line"}>
        {tests.map((test) => (
          <li key={test.id} className={`flex flex-wrap items-start justify-between gap-3 py-4 ${isInBox ? "" : "border-t border-line"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{test.question}</p>
              <p className="type-small text-muted">{`${OUTCOME_LABELS[test.expectedOutcome]}${test.expectedSection ? ` · cites “${test.expectedSection}”` : ""}`}</p>
            </div>
            <QuickActionButton
              label="Remove"
              accessibleLabel={`Remove test question: ${test.question}`}
              icon={Trash2}
              problemAction="chat_policy.remove_test"
              onRun={() => removePolicyTestAction(test.id)}
              undo={{ label: "Undo", problemAction: "chat_policy.restore_test", onRun: () => restorePolicyTestAction({ question: test.question, expectedOutcome: test.expectedOutcome, expectedSection: test.expectedSection ?? "" }) }}
            />
          </li>
        ))}
      </ul>
    </TestListFrame>
  );
}
