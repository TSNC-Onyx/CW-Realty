import type { Metadata } from "next";

import { AssistantSwitch } from "@/components/admin/chat-policy/assistant-switch";
import { PolicyDraftStateProvider } from "@/components/admin/chat-policy/policy-draft-state";
import { PolicyEditor } from "@/components/admin/chat-policy/policy-editor";
import { PolicyHistory, type PolicyVersionRow } from "@/components/admin/chat-policy/policy-history";
import { PolicyTestPanel, type TestScore } from "@/components/admin/chat-policy/policy-test-panel";
import { QuickAnswerChecklist } from "@/components/admin/chat-policy/quick-answer-checklist";
import { LoadProblem } from "@/components/admin/load-problem";
import { Message } from "@/components/ui/message";
import {
  fetchIsAssistantOn,
  fetchLatestPassingRun,
  fetchLatestTestRun,
  fetchPolicyBody,
  fetchPolicyTests,
  fetchPolicyVersions,
  fetchTestsChangedAt,
  fetchWorkingPolicy,
  isLiveRunCurrent,
  isRunCurrent,
  type PolicyTest,
  type PolicyTestRun,
  type PolicyVersion,
  type WorkingPolicy,
} from "@/lib/admin/chat-policy/queries";
import { getHistoryWhenLabel, getTestRows, type OwnerTest } from "@/lib/admin/chat-policy/test-rows";
import { BUILT_IN_TEST_CASES, hasCurrentChecksVersion, hasCurrentSafetyChecks } from "@/lib/admin/chat-policy/test-verdict";
import { getPrivateSections, getPublicSections } from "@/lib/chat/policy-sections";
import { getLoaded, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { OWNER_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { getAssistantStatus } from "@/lib/chat/assistant-status";
import { getQuickAnswerStatuses } from "@/lib/chat/guided-steps";
import { isAssistantConfigured } from "@/lib/chat/claude-model";

export const metadata: Metadata = { title: "Chatbot policy" };

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function getLiveVersion(versions: PolicyVersion[]): PolicyVersion | null {
  return versions.find((version) => version.status === "published") ?? null;
}

/** What visitors get right now (bug 10), with the live version's publish date. */
function getStatusSummary({ live, liveBody, isSwitchOn }: { live: PolicyVersion | null; liveBody: string | null; isSwitchOn: boolean }): string {
  const status = getAssistantStatus({ isSwitchOn, liveVersion: live?.version ?? null, hasPublicSections: getPublicSections(liveBody ?? "").length > 0, isConfigured: isAssistantConfigured() });
  if (!live) return status.text;
  return `${status.text} Version ${live.version} was published ${DATE_TIME.format(new Date(live.published_at ?? live.updated_at))}.`;
}

/** The live version's text: the working policy already holds it while no draft is open. */
async function fetchLiveBody({ admin, working, live }: { admin: AdminContext; working: WorkingPolicy; live: PolicyVersion | null }): Promise<LoadResult<string | null>> {
  if (!live) return getLoaded(null);
  if (!working.draftId) return getLoaded(working.body);
  const policy = await fetchPolicyBody(admin, live.id);
  if (!policy.isLoaded) return policy;
  return getLoaded(policy.data?.body ?? null);
}

type TestSectionProps = {
  working: WorkingPolicy;
  /** The live version, shown with its own test run while there is no draft. */
  live: PolicyVersion | null;
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

function isShownRunCurrent({ run, working, testsChangedAt }: { run: PolicyTestRun | null; working: WorkingPolicy; testsChangedAt: string | null }): boolean {
  if (working.draftId) return isRunCurrent({ run, draft: working, testsChangedAt });
  return isLiveRunCurrent({ run, testsChangedAt });
}

/** With a draft, its latest run; with none, the run that let the live version publish (Admin §6). */
async function fetchShownRun({ admin, working, live }: { admin: AdminContext; working: WorkingPolicy; live: PolicyVersion | null }): Promise<LoadResult<PolicyTestRun | null>> {
  if (working.draftId) return fetchLatestTestRun(admin, working.draftId);
  if (live) return fetchLatestPassingRun(admin, live.id);
  return getLoaded(null);
}

/** A run or stamp that didn't load leaves every question "Not tested yet" and Publish locked, with a notice. */
function TestSectionBody({ working, live, tests, run, testsChangedAt, notice }: TestSectionProps) {
  const didRunLoad = run.isLoaded && testsChangedAt.isLoaded;
  const latestRun = run.isLoaded ? run.data : null;
  const isCurrent = didRunLoad && isShownRunCurrent({ run: latestRun, working, testsChangedAt: testsChangedAt.data });
  const results = latestRun?.results ?? [];
  return (
    <PolicyTestPanel
      runAt={latestRun?.ran_at ?? null}
      draftId={working.draftId}
      draftVersion={working.draftVersion}
      liveVersion={working.draftId ? null : (live?.version ?? null)}
      rows={getTestRows({ tests: getOwnerTests(tests), results, isCurrent })}
      score={getTestScore(latestRun)}
      isReadyToPublish={working.draftId !== null && Boolean(latestRun?.is_passed) && isCurrent && hasCurrentSafetyChecks(results)}
      isCurrent={isCurrent}
      hasCurrentChecksVersion={hasCurrentChecksVersion(results)}
      didRunLoad={didRunLoad}
      isAssistantConfigured={isAssistantConfigured()}
      runProblem={didRunLoad ? null : <LoadProblem notice={notice} />}
      privateSections={getPrivateSections(working.body)}
    />
  );
}

function getHistoryRows({ versions, workingDraftId }: { versions: PolicyVersion[]; workingDraftId: string | null }): PolicyVersionRow[] {
  return versions.map((version) => {
    const isWorkingDraft = version.id === workingDraftId;
    return { id: version.id, version: version.version, whenLabel: getHistoryWhenLabel({ status: version.status, isWorkingDraft, savedText: DATE_TIME.format(new Date(version.updated_at)), publishedText: DATE_TIME.format(new Date(version.published_at ?? version.updated_at)) }), isWorkingDraft };
  });
}

function HistoryBody({ versions, workingDraftId, notice }: { versions: LoadResult<PolicyVersion[]>; workingDraftId: string | null; notice: LoadProblemNotice | null }) {
  if (!versions.isLoaded) return <LoadProblem notice={notice} />;
  if (versions.data.length === 0) return <p>No versions yet.</p>;
  return <PolicyHistory versions={getHistoryRows({ versions: versions.data, workingDraftId })} />;
}

export default async function ChatPolicyPage() {
  const admin = await requireAdminPage(OWNER_ROLES);
  const [versions, tests, testsChangedAt, isAssistantOn] = await Promise.all([fetchPolicyVersions(admin), fetchPolicyTests(admin), fetchTestsChangedAt(admin), fetchIsAssistantOn(admin)]);
  // A failed versions read carries through as the working policy's failure, so it is reported once.
  const working = versions.isLoaded ? await fetchWorkingPolicy(admin, versions.data) : versions;
  const live = versions.isLoaded ? getLiveVersion(versions.data) : null;
  const [run, liveBody] = working.isLoaded ? await Promise.all([fetchShownRun({ admin, working: working.data, live }), fetchLiveBody({ admin, working: working.data, live })]) : [getLoaded(null), getLoaded(null)];
  const notice = await reportPageLoad({ admin, action: "chat_policy.load", results: [working, tests, testsChangedAt, run, isAssistantOn, liveBody] });
  const workingDraft = working.isLoaded && working.data.draftId ? working.data : null;
  return (
    <PolicyDraftStateProvider savedDraftText={workingDraft?.body ?? null}>
      <h1 className="type-h1 mb-2">Chatbot policy</h1>
      <p className="type-lead mb-4 max-w-prose text-muted">The website&apos;s chat assistant answers only from this policy and names the section it used. Anything else goes to a person.</p>
      {isAssistantOn.isLoaded && liveBody.isLoaded && <p className="mb-8 max-w-prose font-semibold">{getStatusSummary({ live, liveBody: liveBody.data, isSwitchOn: isAssistantOn.data })}</p>}
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
            <PolicyEditor draftId={working.data.draftId} initialBody={working.data.body} updatedAt={working.data.updatedAt} />
          </>
        ) : (
          <>
            <h2 id="editor-heading" className="type-h3 mb-4">Policy text</h2>
            <LoadProblem notice={notice} />
          </>
        )}
      </section>
      <section aria-labelledby="topics-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="topics-heading" className="type-h3 mb-2">Chat topic buttons</h2>
        {working.isLoaded ? <QuickAnswerChecklist statuses={getQuickAnswerStatuses(working.data.body)} /> : <LoadProblem notice={notice} />}
      </section>
      <section aria-labelledby="publish-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="publish-heading" className="type-h3 mb-2">Test and publish</h2>
        <p className="mb-4 max-w-prose">{`Each test run asks your questions plus ${BUILT_IN_TEST_CASES.length} built-in safety checks.`} Publishing unlocks once every one passes on the saved draft.</p>
        {working.isLoaded && tests.isLoaded ? <TestSectionBody working={working.data} live={live} tests={tests.data} run={run} testsChangedAt={testsChangedAt} notice={notice} /> : <LoadProblem notice={notice} />}
      </section>
      <section aria-labelledby="history-heading" className="border-t-2 border-ink pt-6">
        <h2 id="history-heading" className="type-h3 mb-2">Version history</h2>
        <HistoryBody versions={versions} workingDraftId={workingDraft?.draftId ?? null} notice={notice} />
      </section>
    </PolicyDraftStateProvider>
  );
}
