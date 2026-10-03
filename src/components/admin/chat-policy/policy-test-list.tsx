"use client";

import { CircleCheck, CircleDashed, CircleX, Clock, Trash2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { removePolicyTestAction, restorePolicyTestAction } from "@/lib/admin/chat-policy/actions";
import type { TestRow, TestRowStatus } from "@/lib/admin/chat-policy/test-rows";
import type { ChatOutcome, HandoffReason } from "@/lib/chat/assistant-reply";
import { getMatchingSection } from "@/lib/chat/policy-sections";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// One list of test questions, each with its last result (docs/cwr-chat-policy-test-batches-plan.md,
// Part C). Status is a word and an icon, never colour alone (WCAG 1.4.1); replies stay folded
// in native <details> until asked for.

const OUTCOME_LABELS: Record<ChatOutcome, string> = { answer: "Should answer", handoff: "Should hand off to a person" };
// Past this many questions the list scrolls inside its own box, so the page stays short (owner request 2026-10-02).
const VISIBLE_QUESTIONS = 5;

// docs/cwr-chat-policy-test-batches-plan.md, Part B: why an answer became a hand-off.
const HANDOFF_REASON_TEXT: Record<HandoffReason, string> = {
  model_handoff: "the assistant found no answer in the policy",
  empty_or_long: "the answer was empty or longer than 1,500 characters",
  bad_citation: "the answer named a section the policy doesn't have",
  leaked_marker: "the answer contained the assistant's own instructions",
};

const STATUS_DISPLAY: Record<TestRowStatus, { label: string; icon: LucideIcon; className: string }> = {
  failed: { label: "Failed", icon: CircleX, className: "text-error" },
  untested: { label: "Not tested yet", icon: CircleDashed, className: "text-warning" },
  stale: { label: "Out of date", icon: Clock, className: "text-muted" },
  passed: { label: "Passed", icon: CircleCheck, className: "text-success" },
};

/** A long list scrolls in a box about five questions tall; the box takes keyboard focus so arrow keys scroll it too. */
function TestListFrame({ count, totalCount, children }: { count: number; totalCount: number; children: ReactNode }) {
  if (count <= VISIBLE_QUESTIONS) return children;
  const label = count === totalCount ? `Test questions, ${count} in all` : `Test questions, showing ${count} of ${totalCount}`;
  return (
    <div role="region" aria-label={label} tabIndex={0} className="policy-test-scroll max-w-prose border border-line px-4">
      {children}
    </div>
  );
}

function getExpectationText(row: TestRow): string {
  return `${OUTCOME_LABELS[row.expectedOutcome]}${row.expectedSection ? ` · cites “${row.expectedSection}”` : ""}`;
}

function TestReply({ row }: { row: TestRow }) {
  if (!row.result) return null;
  return (
    <details className="policy-test-reply mt-1">
      <summary className="type-small cursor-pointer font-semibold underline">
        Show reply<span className="sr-only">{` to: ${row.question}`}</span>
      </summary>
      <div className="type-small mt-2 border-l-2 border-line pl-3">
        <p>{row.result.reply}</p>
        {row.result.citedSections.length > 0 && <p className="text-muted">{`Cited: ${row.result.citedSections.join(", ")}`}</p>}
        {row.result.handoffReason && <p className="text-muted">{`Handed off because ${HANDOFF_REASON_TEXT[row.result.handoffReason]}.`}</p>}
      </div>
    </details>
  );
}

function RemoveTestButton({ row }: { row: TestRow }) {
  const { testId } = row;
  if (!testId) return <p className="type-small text-muted">Built-in, can’t be removed</p>;
  return (
    <QuickActionButton
      label="Remove"
      accessibleLabel={`Remove test question: ${row.question}`}
      icon={Trash2}
      problemAction="chat_policy.remove_test"
      onRun={() => removePolicyTestAction(testId)}
      undo={{ label: "Undo", problemAction: "chat_policy.restore_test", onRun: () => restorePolicyTestAction({ question: row.question, expectedOutcome: row.expectedOutcome, expectedSection: row.expectedSection ?? "" }) }}
    />
  );
}

type TestListItemProps = { row: TestRow; isInBox: boolean; isPrivateSection: boolean };

function TestListItem({ row, isInBox, isPrivateSection }: TestListItemProps) {
  const status = STATUS_DISPLAY[row.status];
  const StatusIcon = status.icon;
  return (
    <li className={`flex flex-wrap items-start justify-between gap-3 py-4 ${isInBox ? "" : "border-t border-line"}`}>
      <div className="flex min-w-0 flex-1 gap-3">
        <StatusIcon aria-hidden size={ICON_SIZE.message} className={`mt-1 shrink-0 ${status.className}`} />
        <div className="min-w-0">
          <p className="font-semibold">{`${status.label}: ${row.question}`}</p>
          <p className="type-small text-muted">{row.isBuiltIn ? `Built-in safety check · ${getExpectationText(row)}` : getExpectationText(row)}</p>
          {isPrivateSection && <p className="type-small text-warning">Cites a private section, so this test can’t pass.</p>}
          <TestReply row={row} />
        </div>
      </div>
      <RemoveTestButton row={row} />
    </li>
  );
}

type PolicyTestListProps = {
  /** The rows the chosen filter shows. */
  rows: TestRow[];
  /** Every row, for the scroll box's name. */
  totalCount: number;
  /** The draft's "(private)" headings; a row citing one is flagged. */
  privateSections: string[];
};

export function PolicyTestList({ rows, totalCount, privateSections }: PolicyTestListProps) {
  // Inside the box, rules go between questions only, so they don't double the box's own border.
  const isInBox = rows.length > VISIBLE_QUESTIONS;
  return (
    <TestListFrame count={rows.length} totalCount={totalCount}>
      <ul className={isInBox ? "divide-y divide-line" : "max-w-prose border-b border-line"}>
        {rows.map((row) => (
          <TestListItem key={row.key} row={row} isInBox={isInBox} isPrivateSection={row.expectedSection !== null && getMatchingSection(privateSections, row.expectedSection) !== null} />
        ))}
      </ul>
    </TestListFrame>
  );
}
