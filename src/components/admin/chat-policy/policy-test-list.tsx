"use client";

import { Check, CircleCheck, CircleDashed, CircleX, Clock, MessageSquare, PencilLine, ShieldAlert, Trash2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { editPolicySection, tryInTestChat } from "@/components/admin/chat-policy/policy-page-events";
import { QuickActionButton } from "@/components/admin/quick-action-button";
import { getButtonClassName } from "@/components/ui/button-link";
import { removePolicyTestAction, restorePolicyTestAction, updatePolicyTestAction } from "@/lib/admin/chat-policy/actions";
import { getTestExpectation, type TestExpectation } from "@/lib/admin/chat-policy/policy-schema";
import { getFailureHelp, type FailureHelp, type QuestionFix } from "@/lib/admin/chat-policy/test-failures";
import type { TestRow, TestRowStatus } from "@/lib/admin/chat-policy/test-rows";
import type { PolicyTestResult } from "@/lib/admin/chat-policy/test-verdict";
import type { HandoffReason } from "@/lib/chat/assistant-reply";
import { getMatchingSection } from "@/lib/chat/policy-sections";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// One list of test questions, each with its last result (docs/cwr-chat-policy-test-batches-plan.md,
// Part C). A failure shows, next to the question, what was expected, what the assistant did, why
// it failed in plain words, and one-click fixes with Undo (docs/cwr-chat-quick-answers-and-tests-plan.md
// §E, NN/g error messages). Built-in safety failures go to the developer automatically. Status is
// a word and an icon, never colour alone (WCAG 1.4.1); passed replies stay folded.

const EXPECTATION_LABELS: Record<TestExpectation, string> = {
  answer: "Should answer from the policy",
  answer_or_friendly: "Should answer, or reply in its own words",
  handoff: "Should offer a person",
};
// Past this many questions the list scrolls inside its own box, so the page stays short (owner request 2026-10-02).
const VISIBLE_QUESTIONS = 5;

// docs/cwr-chat-policy-test-batches-plan.md, Part B: why an answer became a hand-off.
const HANDOFF_REASON_TEXT: Record<HandoffReason, string> = {
  model_handoff: "the assistant chose to hand off",
  empty_or_long: "the reply was empty or too long",
  bad_citation: "the answer named a section the policy doesn't have",
  leaked_marker: "the answer contained the assistant's own instructions",
  unsafe_conversation: "the AI-written reply had a number, price, email or link, so an approved line was used",
  lead: "the visitor sounded ready to buy, sell, rent or have a home managed, so the lead line offered a broker",
  lead_downgraded: "the question tied who lives somewhere to where to live, so the plain hand-off line was used instead of the lead line",
  policy_fact_in_conversation: "the AI-written small talk repeated facts or names from the policy, so an approved line was used",
  slang_in_conversation: "the AI-written small talk used slang, so an approved line was used",
  safety_wording: "the question touched a safety rule (who lives where, or the assistant's own instructions), so the approved line was used",
};

const AI_WRITTEN_NOTE = "Passed · the visitor would see an AI-written reply. Read it before publishing.";
const UNSTABLE_NOTE = "Passed on the second try. Answers vary a little; making this section clearer helps it pass every time.";

const FIX_LABELS: Record<QuestionFix, string> = {
  accept_friendly_reply: "Accept a friendly reply",
  expect_handoff: "Change to: should offer a person",
  expect_answer: "Accept: answering is fine",
  accept_cited_section: "Accept the section it used",
  any_section: "Any section is fine",
};

type StatusDisplay = { label: string; icon: LucideIcon; className: string };

const STATUS_DISPLAY: Record<Exclude<TestRowStatus, "failed">, StatusDisplay> = {
  untested: { label: "Not tested yet", icon: CircleDashed, className: "text-warning" },
  stale: { label: "Out of date", icon: Clock, className: "text-muted" },
  passed: { label: "Passed", icon: CircleCheck, className: "text-success" },
};

const OWNER_FAILURE_DISPLAY: StatusDisplay = { label: "Needs your attention", icon: CircleX, className: "text-error" };
const DEVELOPER_FAILURE_DISPLAY: StatusDisplay = { label: "Developer notified", icon: ShieldAlert, className: "text-error" };
const NO_REPLY_DISPLAY: StatusDisplay = { label: "No reply", icon: CircleX, className: "text-error" };

type FailedRow = TestRow & { result: PolicyTestResult };

/** Part 2 C1: the owner reads AI-written hand-offs before publishing (HUD: the provider stays responsible). */
function isAiWrittenPass(row: TestRow): boolean {
  return row.status === "passed" && row.result?.outcome === "handoff" && row.result.isApprovedWording === false;
}

function getFailedRow(row: TestRow): FailedRow | null {
  return row.status === "failed" && row.result ? { ...row, result: row.result } : null;
}

function getStatusDisplay(row: TestRow): StatusDisplay {
  if (row.status !== "failed") return STATUS_DISPLAY[row.status];
  if (row.isBuiltIn) return DEVELOPER_FAILURE_DISPLAY;
  return row.result?.outcome === null ? NO_REPLY_DISPLAY : OWNER_FAILURE_DISPLAY;
}

function getExpectationText(row: TestRow): string {
  const sectionText = row.expectedSection ? ` · cites “${row.expectedSection}”` : "";
  const mentionText = row.mustMention.length > 0 ? ` · mentions ${row.mustMention.map((phrase) => `“${phrase}”`).join(", ")}` : "";
  return `${EXPECTATION_LABELS[getTestExpectation(row)]}${sectionText}${mentionText}`;
}

function getActualText(result: PolicyTestResult): string {
  if (result.outcome === null) return "The assistant didn't reply.";
  if (result.outcome === "answer") return `The assistant answered${result.citedSections.length > 0 ? `, citing “${result.citedSections.join("”, “")}”` : ""}.`;
  return result.isApprovedWording === false ? "The assistant replied in its own words instead of answering from the policy." : "The assistant offered a person.";
}

/** The fix's new expectation and section; the row's current ones are the Undo. */
function getFixTarget({ row, fix }: { row: FailedRow; fix: QuestionFix }): { expectation: TestExpectation; expectedSection: string } {
  const current = { expectation: getTestExpectation(row), expectedSection: row.expectedSection ?? "" };
  if (fix === "accept_friendly_reply") return { ...current, expectation: "answer_or_friendly" };
  if (fix === "expect_handoff") return { ...current, expectation: "handoff" };
  if (fix === "expect_answer") return { ...current, expectation: "answer" };
  if (fix === "accept_cited_section") return { ...current, expectedSection: row.result.citedSections[0] ?? "" };
  return { ...current, expectedSection: "" };
}

function QuestionFixButton({ row, fix }: { row: FailedRow & { testId: string }; fix: QuestionFix }) {
  const target = getFixTarget({ row, fix });
  const previous = { expectation: getTestExpectation(row), expectedSection: row.expectedSection ?? "" };
  const label = fix === "accept_cited_section" ? `Accept “${target.expectedSection}”` : FIX_LABELS[fix];
  return (
    <QuickActionButton
      label={label}
      accessibleLabel={`${label} for: ${row.question}`}
      icon={Check}
      problemAction="chat_policy.update_test"
      onRun={() => updatePolicyTestAction({ testId: row.testId, ...target })}
      undo={{ label: "Undo", problemAction: "chat_policy.update_test", onRun: () => updatePolicyTestAction({ testId: row.testId, ...previous }) }}
    />
  );
}

function PageLinkButton({ label, accessibleLabel, icon: Icon, onClick }: { label: string; accessibleLabel: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={accessibleLabel} className={`${getButtonClassName({ size: "s", variant: "secondary" })} px-3`}>
      <Icon aria-hidden size={ICON_SIZE.button} />
      {label}
    </button>
  );
}

function FailureFixes({ row, help }: { row: FailedRow; help: FailureHelp }) {
  const { testId } = row;
  const sectionToEdit = row.expectedSection ?? row.result.citedSections[0] ?? null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {testId && help.questionFixes.map((fix) => <QuestionFixButton key={fix} row={{ ...row, testId }} fix={fix} />)}
      {help.canEditSection && sectionToEdit && <PageLinkButton label="Edit this section" accessibleLabel={`Edit the section “${sectionToEdit}” in the policy text`} icon={PencilLine} onClick={() => editPolicySection(sectionToEdit)} />}
      {help.canTryInChat && <PageLinkButton label="Try it in the test chat" accessibleLabel={`Try “${row.question}” in the test chat`} icon={MessageSquare} onClick={() => tryInTestChat(row.question)} />}
    </div>
  );
}

function ReplyDetails({ result }: { result: PolicyTestResult }) {
  return (
    <>
      <p>{result.reply}</p>
      {result.citedSections.length > 0 && <p className="text-muted">{`Cited: ${result.citedSections.join(", ")}`}</p>}
      {result.handoffReason && <p className="text-muted">{`Handed off because ${HANDOFF_REASON_TEXT[result.handoffReason]}.`}</p>}
    </>
  );
}

function FailureCard({ row }: { row: FailedRow }) {
  const help = getFailureHelp(row.result);
  const missingPhrases = row.result.missingPhrases ?? [];
  return (
    <div className="mt-2 border-l-2 border-error pl-3">
      <p className="font-semibold">{help.why}</p>
      <p className="type-small mt-1">{getActualText(row.result)}</p>
      {missingPhrases.length > 0 && <p className="type-small">{`Missing: ${missingPhrases.map((phrase) => `“${phrase}”`).join(", ")}`}</p>}
      <div className="type-small mt-2 border-l-2 border-line pl-3">
        <ReplyDetails result={row.result} />
      </div>
      {help.isOwnerFixable && <FailureFixes row={row} help={help} />}
    </div>
  );
}

function FoldedReply({ row }: { row: TestRow }) {
  if (!row.result) return null;
  return (
    <details className="policy-test-reply mt-1">
      <summary className="type-small cursor-pointer font-semibold underline">
        Show reply<span className="sr-only">{` to: ${row.question}`}</span>
      </summary>
      <div className="type-small mt-2 border-l-2 border-line pl-3">
        <ReplyDetails result={row.result} />
      </div>
    </details>
  );
}

function RemoveTestButton({ row }: { row: TestRow }) {
  const { testId } = row;
  if (!testId) return <p className="type-small text-muted">Built-in, can’t be removed</p>;
  const restoreInput = { question: row.question, expectation: getTestExpectation(row), expectedSection: row.expectedSection ?? "", mustMention: row.mustMention.join(", ") };
  return (
    <QuickActionButton
      label="Remove"
      accessibleLabel={`Remove test question: ${row.question}`}
      icon={Trash2}
      problemAction="chat_policy.remove_test"
      onRun={() => removePolicyTestAction(testId)}
      undo={{ label: "Undo", problemAction: "chat_policy.restore_test", onRun: () => restorePolicyTestAction(restoreInput) }}
    />
  );
}

function PassNotes({ row }: { row: TestRow }) {
  return (
    <>
      {isAiWrittenPass(row) && <p className="type-small text-muted">{AI_WRITTEN_NOTE}</p>}
      {row.status === "passed" && row.result?.isUnstable && <p className="type-small text-warning">{UNSTABLE_NOTE}</p>}
    </>
  );
}

/** Why a question's expected section can't be cited: private, or no longer in the draft. */
type SectionProblem = "private" | "missing" | null;

const SECTION_PROBLEM_TEXT: Record<Exclude<SectionProblem, null>, string> = {
  private: "Cites a private section, so this test can’t pass.",
  missing: "Cites a section this draft doesn’t have. Pick another section, or use “Any section is fine”.",
};

type TestListItemProps = { row: TestRow; isInBox: boolean; sectionProblem: SectionProblem };

function TestListItem({ row, isInBox, sectionProblem }: TestListItemProps) {
  const status = getStatusDisplay(row);
  const StatusIcon = status.icon;
  const failedRow = getFailedRow(row);
  return (
    <li className={`flex flex-wrap items-start justify-between gap-3 py-4 ${isInBox ? "" : "border-t border-line"}`}>
      <div className="flex min-w-0 flex-1 gap-3">
        <StatusIcon aria-hidden size={ICON_SIZE.message} className={`mt-1 shrink-0 ${status.className}`} />
        <div className="min-w-0">
          <p className="font-semibold">{`${status.label}: ${row.question}`}</p>
          <p className="type-small text-muted">{row.isBuiltIn ? `Built-in safety check · ${getExpectationText(row)}` : getExpectationText(row)}</p>
          {sectionProblem && <p className="type-small text-warning">{SECTION_PROBLEM_TEXT[sectionProblem]}</p>}
          <PassNotes row={row} />
          {failedRow ? <FailureCard row={failedRow} /> : <FoldedReply row={row} />}
        </div>
      </div>
      <RemoveTestButton row={row} />
    </li>
  );
}

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

type PolicyTestListProps = {
  /** The rows the chosen filter shows. */
  rows: TestRow[];
  /** Every row, for the scroll box's name. */
  totalCount: number;
  /** The draft's "(private)" headings; a row citing one is flagged. */
  privateSections: string[];
  /** The draft's headings the assistant may cite; a row citing anything else is flagged. */
  sections: string[];
};

function getSectionProblem({ row, privateSections, sections }: { row: TestRow; privateSections: string[]; sections: string[] }): SectionProblem {
  if (row.expectedSection === null) return null;
  if (getMatchingSection(privateSections, row.expectedSection) !== null) return "private";
  return getMatchingSection(sections, row.expectedSection) === null ? "missing" : null;
}

export function PolicyTestList({ rows, totalCount, privateSections, sections }: PolicyTestListProps) {
  // Inside the box, rules go between questions only, so they don't double the box's own border.
  const isInBox = rows.length > VISIBLE_QUESTIONS;
  return (
    <TestListFrame count={rows.length} totalCount={totalCount}>
      <ul className={isInBox ? "divide-y divide-line" : "max-w-prose border-b border-line"}>
        {rows.map((row) => (
          <TestListItem key={row.key} row={row} isInBox={isInBox} sectionProblem={getSectionProblem({ row, privateSections, sections })} />
        ))}
      </ul>
    </TestListFrame>
  );
}
