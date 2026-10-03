import { CircleCheck, CircleX, ListChecks } from "lucide-react";
import type { Metadata } from "next";

import { AssistantSwitch } from "@/components/admin/chat-policy/assistant-switch";
import { PolicyEditor } from "@/components/admin/chat-policy/policy-editor";
import { PolicyHistory } from "@/components/admin/chat-policy/policy-history";
import { PolicyPublishing } from "@/components/admin/chat-policy/policy-publishing";
import { PolicyTestForm } from "@/components/admin/chat-policy/policy-test-form";
import { PolicyTestList } from "@/components/admin/chat-policy/policy-test-list";
import { LoadProblem } from "@/components/admin/load-problem";
import { EmptyState } from "@/components/ui/empty-state";
import { Message } from "@/components/ui/message";
import {
  fetchIsAssistantOn,
  fetchLatestTestRun,
  fetchPolicyTests,
  fetchPolicyVersions,
  fetchTestsChangedAt,
  fetchWorkingPolicy,
  isRunCurrent,
  type PolicyStatus,
  type PolicyTest,
  type PolicyTestRun,
  type PolicyVersion,
  type WorkingPolicy,
} from "@/lib/admin/chat-policy/queries";
import { getLoaded, type LoadResult } from "@/lib/admin/load-result";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { OWNER_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { isAssistantConfigured } from "@/lib/chat/claude-model";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

export const metadata: Metadata = { title: "Chatbot policy" };

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const STATUS_LABELS: Record<PolicyStatus, string> = { draft: "Draft", published: "Live now", archived: "Earlier live version" };

function getLiveSummary(versions: PolicyVersion[]): string {
  const live = versions.find((version) => version.status === "published");
  if (!live) return "Nothing is published yet, so the website chat hands every question to a person.";
  return `Version ${live.version} is live, published ${DATE_TIME.format(new Date(live.published_at ?? live.updated_at))}.`;
}

function TestRunResults({ run, isCurrent }: { run: PolicyTestRun; isCurrent: boolean }) {
  return (
    <div className="mt-6 grid max-w-prose gap-4">
      <p className="type-small text-muted">{`Last run ${DATE_TIME.format(new Date(run.ran_at))}${isCurrent ? "" : " — the draft or questions changed since, so run the tests again"}.`}</p>
      <ul className="border-b border-line">
        {run.results.map((result, index) => (
          <li key={`${index}-${result.question}`} className="flex gap-3 border-t border-line py-3">
            {result.isPassed ? <CircleCheck aria-hidden size={ICON_SIZE.message} className="shrink-0 text-success" /> : <CircleX aria-hidden size={ICON_SIZE.message} className="shrink-0 text-error" />}
            <div className="min-w-0">
              <p className="font-semibold">{`${result.isPassed ? "Passed" : "Failed"}: ${result.question}`}</p>
              {result.isBuiltIn && <p className="type-small text-muted">Built-in safety check</p>}
              <p className="type-small mt-1">{`Reply: ${result.reply}`}</p>
              {result.citedSections.length > 0 && <p className="type-small text-muted">{`Cited: ${result.citedSections.join(", ")}`}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type PublishSectionProps = { working: WorkingPolicy; run: LoadResult<PolicyTestRun | null>; testsChangedAt: LoadResult<string | null>; notice: LoadProblemNotice | null };

function PublishSectionBody({ working, run, testsChangedAt, notice }: PublishSectionProps) {
  if (!working.draftId) return <p className="max-w-prose">Save a draft first. Then run the tests and publish it.</p>;
  if (!run.isLoaded || !testsChangedAt.isLoaded) return <LoadProblem notice={notice} />;
  const isCurrent = isRunCurrent({ run: run.data, draft: working, testsChangedAt: testsChangedAt.data });
  return (
    <>
      <p className="mb-4 max-w-prose">{`Tests run on the saved draft version ${working.draftVersion}. Publishing unlocks once every test passes.`}</p>
      <PolicyPublishing draftId={working.draftId} isReadyToPublish={Boolean(run.data?.is_passed) && isCurrent} />
      {run.data && <TestRunResults run={run.data} isCurrent={isCurrent} />}
    </>
  );
}

function TestListBody({ tests, notice }: { tests: LoadResult<PolicyTest[]>; notice: LoadProblemNotice | null }) {
  if (!tests.isLoaded) return <LoadProblem notice={notice} />;
  if (tests.data.length === 0) {
    return <EmptyState icon={ListChecks} titleId="tests-empty" title="No test questions yet" description="Add a few questions visitors often ask, and what the assistant should do with each." action={<p className="type-small text-muted">Use the form below.</p>} />;
  }
  return <PolicyTestList tests={tests.data.map((test) => ({ id: test.id, question: test.question, expectedOutcome: test.expected_outcome, expectedSection: test.expected_section }))} />;
}

function HistoryBody({ versions, notice }: { versions: LoadResult<PolicyVersion[]>; notice: LoadProblemNotice | null }) {
  if (!versions.isLoaded) return <LoadProblem notice={notice} />;
  if (versions.data.length === 0) return <p>No versions yet.</p>;
  return <PolicyHistory versions={versions.data.map((version) => ({ id: version.id, version: version.version, statusLabel: STATUS_LABELS[version.status], when: DATE_TIME.format(new Date(version.published_at ?? version.updated_at)) }))} />;
}

export default async function ChatPolicyPage() {
  const admin = await requireAdminPage(OWNER_ROLES);
  const [versions, tests, testsChangedAt, isAssistantOn] = await Promise.all([fetchPolicyVersions(admin), fetchPolicyTests(admin), fetchTestsChangedAt(admin), fetchIsAssistantOn(admin)]);
  // A failed versions read carries through as the working policy's failure, so it is reported once.
  const working = versions.isLoaded ? await fetchWorkingPolicy(admin, versions.data) : versions;
  const run = working.isLoaded && working.data.draftId ? await fetchLatestTestRun(admin, working.data.draftId) : getLoaded(null);
  const notice = await reportPageLoad({ admin, action: "chat_policy.load", results: [working, tests, testsChangedAt, run, isAssistantOn] });
  return (
    <>
      <h1 className="type-h1 mb-2">Chatbot policy</h1>
      <p className="type-lead mb-4 max-w-prose text-muted">The website&apos;s chat assistant answers only from this policy and names the section it used. Anything else goes to a person.</p>
      {versions.isLoaded && <p className="mb-8 max-w-prose font-semibold">{getLiveSummary(versions.data)}</p>}
      {!isAssistantConfigured() && (
        <div className="mb-8 max-w-prose">
          <Message tone="warning" title="The chat assistant isn't connected yet">
            <p>You can write and save the policy now. Tests and answers start working once the Anthropic API key is added at launch; until then, visitors are offered a person.</p>
          </Message>
        </div>
      )}
      <section aria-labelledby="switch-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="switch-heading" className="type-h3 mb-2">Assistant on or off</h2>
        {isAssistantOn.isLoaded ? <AssistantSwitch isOn={isAssistantOn.data} /> : <LoadProblem notice={notice} />}
      </section>
      <section aria-labelledby="editor-heading" className="mb-12 border-t-2 border-ink pt-6">
        {working.isLoaded ? (
          <>
            <h2 id="editor-heading" className="type-h3 mb-4">{working.data.draftVersion ? `Editing draft version ${working.data.draftVersion}` : "Write a new draft"}</h2>
            <PolicyEditor draftId={working.data.draftId} initialBody={working.data.body} />
          </>
        ) : (
          <>
            <h2 id="editor-heading" className="type-h3 mb-4">Policy text</h2>
            <LoadProblem notice={notice} />
          </>
        )}
      </section>
      <section aria-labelledby="tests-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="tests-heading" className="type-h3 mb-2">Test questions</h2>
        <p className="mb-4 max-w-prose">Each test run asks these questions, plus four built-in safety checks, and checks what the assistant does.</p>
        <TestListBody tests={tests} notice={notice} />
        <h3 className="type-h3 mt-10 mb-4">Add a test question</h3>
        <PolicyTestForm />
      </section>
      <section aria-labelledby="publish-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="publish-heading" className="type-h3 mb-2">Test and publish</h2>
        {working.isLoaded ? <PublishSectionBody working={working.data} run={run} testsChangedAt={testsChangedAt} notice={notice} /> : <LoadProblem notice={notice} />}
      </section>
      <section aria-labelledby="history-heading" className="border-t-2 border-ink pt-6">
        <h2 id="history-heading" className="type-h3 mb-2">Version history</h2>
        <HistoryBody versions={versions} notice={notice} />
      </section>
    </>
  );
}
