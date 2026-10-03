import type { Metadata } from "next";

import { AssistantSwitch } from "@/components/admin/chat-policy/assistant-switch";
import { PolicyEditor } from "@/components/admin/chat-policy/policy-editor";
import { PolicyHistory } from "@/components/admin/chat-policy/policy-history";
import { PolicyTestPanel, type TestScore } from "@/components/admin/chat-policy/policy-test-panel";
import { LoadProblem } from "@/components/admin/load-problem";
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
import { getTestRows, type OwnerTest } from "@/lib/admin/chat-policy/test-rows";
import { getPrivateSections } from "@/lib/chat/policy-sections";
import { getLoaded, type LoadResult } from "@/lib/admin/load-result";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { OWNER_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { isAssistantConfigured } from "@/lib/chat/claude-model";

export const metadata: Metadata = { title: "Chatbot policy" };

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const STATUS_LABELS: Record<PolicyStatus, string> = { draft: "Draft", published: "Live now", archived: "Earlier live version" };

function getLiveSummary(versions: PolicyVersion[]): string {
  const live = versions.find((version) => version.status === "published");
  if (!live) return "Nothing is published yet, so the website chat hands every question to a person.";
  return `Version ${live.version} is live, published ${DATE_TIME.format(new Date(live.published_at ?? live.updated_at))}.`;
}

type TestSectionProps = {
  working: WorkingPolicy;
  tests: PolicyTest[];
  run: LoadResult<PolicyTestRun | null>;
  testsChangedAt: LoadResult<string | null>;
  notice: LoadProblemNotice | null;
};

function getOwnerTests(tests: PolicyTest[]): OwnerTest[] {
  return tests.map((test) => ({ id: test.id, question: test.question, expectedOutcome: test.expected_outcome, expectedSection: test.expected_section }));
}

function getTestScore(run: PolicyTestRun | null): TestScore | null {
  if (!run) return null;
  return { passed: run.results.filter((result) => result.isPassed).length, total: run.results.length, lastRunText: DATE_TIME.format(new Date(run.ran_at)) };
}

/** A run or stamp that didn't load leaves every question "Not tested yet" and Publish locked, with a notice. */
function TestSectionBody({ working, tests, run, testsChangedAt, notice }: TestSectionProps) {
  const didRunLoad = run.isLoaded && testsChangedAt.isLoaded;
  const latestRun = run.isLoaded ? run.data : null;
  const isCurrent = didRunLoad && isRunCurrent({ run: latestRun, draft: working, testsChangedAt: testsChangedAt.data });
  return (
    <PolicyTestPanel
      runAt={latestRun?.ran_at ?? null}
      draftId={working.draftId}
      draftVersion={working.draftVersion}
      rows={getTestRows({ tests: getOwnerTests(tests), results: latestRun?.results ?? [], isCurrent })}
      score={getTestScore(latestRun)}
      isReadyToPublish={Boolean(latestRun?.is_passed) && isCurrent}
      isCurrent={isCurrent}
      didRunLoad={didRunLoad}
      isAssistantConfigured={isAssistantConfigured()}
      runProblem={didRunLoad ? null : <LoadProblem notice={notice} />}
      privateSections={getPrivateSections(working.body)}
    />
  );
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
      <section aria-labelledby="publish-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="publish-heading" className="type-h3 mb-2">Test and publish</h2>
        <p className="mb-4 max-w-prose">Each test run asks your questions plus four built-in safety checks. Publishing unlocks once every one passes on the saved draft.</p>
        {working.isLoaded && tests.isLoaded ? <TestSectionBody working={working.data} tests={tests.data} run={run} testsChangedAt={testsChangedAt} notice={notice} /> : <LoadProblem notice={notice} />}
      </section>
      <section aria-labelledby="history-heading" className="border-t-2 border-ink pt-6">
        <h2 id="history-heading" className="type-h3 mb-2">Version history</h2>
        <HistoryBody versions={versions} notice={notice} />
      </section>
    </>
  );
}
