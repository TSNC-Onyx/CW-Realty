"use client";

import { Plus } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { PolicyPublishing } from "@/components/admin/chat-policy/policy-publishing";
import { PolicyTestForm } from "@/components/admin/chat-policy/policy-test-form";
import { PolicyTestList } from "@/components/admin/chat-policy/policy-test-list";
import { getButtonClassName } from "@/components/ui/button-link";
import { getPublishBlocker, getTestCounts, type TestRow, type TestRowStatus } from "@/lib/admin/chat-policy/test-rows";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// "Test and publish" (docs/cwr-chat-policy-test-batches-plan.md, Part C): one list of the
// questions with their last results, the run and Publish buttons, and a plain reason
// whenever Publish is locked.

type TestFilter = "all" | TestRowStatus;

const FILTERS: { value: TestFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "untested", label: "Not tested" },
  { value: "stale", label: "Out of date" },
  { value: "passed", label: "Passed" },
];

export type TestScore = { passed: number; total: number; lastRunText: string };

type PolicyTestPanelProps = {
  /** When the latest run was saved: a new run opens the list on its failed questions again. */
  runAt: string | null;
  draftId: string | null;
  draftVersion: number | null;
  rows: TestRow[];
  score: TestScore | null;
  isReadyToPublish: boolean;
  isCurrent: boolean;
  didRunLoad: boolean;
  isAssistantConfigured: boolean;
  /** Shown above the list when the last run didn't load. */
  runProblem: ReactNode;
  /** The draft's "(private)" headings, which no test can cite. */
  privateSections: string[];
};

function getScoreText({ score, isCurrent }: { score: TestScore | null; isCurrent: boolean }): string {
  if (!score) return "Not run yet";
  return `${score.passed} of ${score.total} passed${isCurrent ? "" : " (out of date)"}`;
}

function TestStatusBox({ draftId, draftVersion, score, isCurrent, isReadyToPublish, isRunning, onRunningChange }: Pick<PolicyTestPanelProps, "draftId" | "draftVersion" | "score" | "isCurrent" | "isReadyToPublish"> & { isRunning: boolean; onRunningChange: (isRunning: boolean) => void }) {
  return (
    <div className="mb-4 flex max-w-prose flex-wrap items-start justify-between gap-4 border border-line bg-surface p-4">
      <div>
        <p className="type-h3">{getScoreText({ score, isCurrent })}</p>
        <p className="type-small text-muted">{[draftVersion ? `Draft version ${draftVersion}` : "No saved draft", score ? `last run ${score.lastRunText}` : null].filter(Boolean).join(" · ")}</p>
      </div>
      {draftId && <PolicyPublishing draftId={draftId} isReadyToPublish={isReadyToPublish} isRunning={isRunning} onRunningChange={onRunningChange} />}
    </div>
  );
}

function TestFilters({ counts, shownFilter, onChange }: { counts: Record<TestFilter, number>; shownFilter: TestFilter; onChange: (filter: TestFilter) => void }) {
  return (
    <div role="group" aria-label="Show" className="mb-2 flex flex-wrap gap-2">
      {FILTERS.filter((filter) => filter.value === "all" || counts[filter.value] > 0).map((filter) => (
        <button key={filter.value} type="button" aria-pressed={shownFilter === filter.value} onClick={() => onChange(filter.value)} className="policy-test-filter">
          {`${filter.label} ${counts[filter.value]}`}
        </button>
      ))}
    </div>
  );
}

function AddTestDisclosure({ hasOwnerTests, privateSections }: { hasOwnerTests: boolean; privateSections: string[] }) {
  const [isOpen, setIsOpen] = useState(!hasOwnerTests);
  const formId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const handleCancel = () => {
    setIsOpen(false);
    toggleRef.current?.focus();
  };
  return (
    <div className="mt-6">
      <button ref={toggleRef} type="button" aria-expanded={isOpen} aria-controls={formId} onClick={() => setIsOpen((wasOpen) => !wasOpen)} className={getButtonClassName({ size: "s", variant: "secondary" })}>
        <Plus aria-hidden size={ICON_SIZE.button} />
        Add a test question
      </button>
      <div id={formId} hidden={!isOpen} className="mt-4 grid gap-4">
        <PolicyTestForm privateSections={privateSections} />
        <div>
          <button type="button" onClick={handleCancel} className="type-small font-semibold underline">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

type FilterChoice = { runAt: string | null; filter: TestFilter };

export function PolicyTestPanel({ runAt, draftId, draftVersion, rows, score, isReadyToPublish, isCurrent, didRunLoad, isAssistantConfigured, runProblem, privateSections }: PolicyTestPanelProps) {
  const counts = getTestCounts(rows);
  const hasOwnerTests = rows.some((row) => !row.isBuiltIn);
  const [isRunning, setIsRunning] = useState(false);
  // The panel stays mounted across refreshes (so focus stays on the run button); a choice made
  // before the latest run is dropped, so a fresh run opens on its failed questions.
  const [filterChoice, setFilterChoice] = useState<FilterChoice | null>(null);
  const chosenFilter = filterChoice?.runAt === runAt ? filterChoice.filter : counts.failed > 0 ? "failed" : "all";
  // A view that empties (the last failure was fixed or removed) falls back to every question.
  const shownFilter = chosenFilter !== "all" && counts[chosenFilter] === 0 ? "all" : chosenFilter;
  const shownRows = shownFilter === "all" ? rows : rows.filter((row) => row.status === shownFilter);
  const blocker = getPublishBlocker({ isReadyToPublish, isRunning, hasDraft: draftId !== null, didRunLoad, isAssistantConfigured, hasRun: score !== null, isCurrent, counts });
  return (
    <>
      <TestStatusBox draftId={draftId} draftVersion={draftVersion} score={score} isCurrent={isCurrent} isReadyToPublish={isReadyToPublish} isRunning={isRunning} onRunningChange={setIsRunning} />
      {blocker && <p className="policy-test-blocker mb-4 max-w-prose">{`Publish is locked: ${blocker}`}</p>}
      {runProblem}
      <TestFilters counts={counts} shownFilter={shownFilter} onChange={(filter) => setFilterChoice({ runAt, filter })} />
      <p role="status" className="type-small mb-2 text-muted">{`Showing ${shownRows.length}.`}</p>
      <PolicyTestList rows={shownRows} totalCount={rows.length} privateSections={privateSections} />
      {!hasOwnerTests && <p className="mt-4 max-w-prose">No questions of your own yet. Add a few questions visitors often ask, and what the assistant should do with each.</p>}
      <AddTestDisclosure hasOwnerTests={hasOwnerTests} privateSections={privateSections} />
    </>
  );
}
