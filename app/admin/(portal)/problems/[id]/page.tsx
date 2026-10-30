import type { Metadata } from "next";
import { z } from "zod";

import { LoadProblem } from "@/components/admin/load-problem";
import { ResolveForm } from "@/components/admin/problems/resolve-form";
import { SeverityLabel } from "@/components/admin/problems/severity-label";
import { TraceView } from "@/components/admin/problems/trace-view";
import { Pagination } from "@/components/content/pagination";
import { TextLink } from "@/components/ui/text-link";
import { PROBLEM_OCCURRENCES_PAGE_SIZE, fetchProblemGroup, fetchProblemOccurrences, type ProblemGroupSummary, type ProblemOccurrence } from "@/lib/admin/problems/queries";
import { showPageNotFound } from "@/lib/admin/record-page-not-found";
import { reportPageLoad } from "@/lib/admin/report-page-load";
import { OWNER_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { fetchAdminUsers } from "@/lib/admin/users/queries";
import { getPageNumber, getTotalPages } from "@/lib/content/page-number";

export const metadata: Metadata = { title: "Problem" };

// One problem group (owners only): what it is, every time it happened with its reference and
// stack trace, and "Mark resolved" (docs/cwr-error-tracking-plan.md "Group detail").

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const ORIGIN_LABELS: Record<string, string> = {
  server_member: "Team member",
  browser_member: "Team member's browser",
  server_signin: "Sign-in page",
  browser_signin: "Sign-in page, browser",
  server_visitor: "Website visitor",
  browser_visitor: "Website visitor's browser",
  job: "Background job",
  database: "Database check",
  github: "Nightly clean-up",
};
// A stack line ends with "file:line:column"; only reports with one can be read back.
const FRAME_PATTERN = /:\d+:\d+\)?\s*$/m;

type ProblemPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> };

function getPerson({ occurrence, emails }: { occurrence: ProblemOccurrence; emails: Map<string, string> }): string {
  const origin = ORIGIN_LABELS[occurrence.origin] ?? occurrence.origin;
  if (!occurrence.actor_id) return origin;
  return `${emails.get(occurrence.actor_id) ?? "Someone no longer on the team"}${occurrence.actor_role ? ` (${occurrence.actor_role})` : ""}`;
}

function GroupSummary({ group }: { group: ProblemGroupSummary }) {
  return (
    <dl className="mb-8 grid max-w-prose gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
      <dt className="font-bold">Severity</dt>
      <dd>
        <SeverityLabel severity={group.max_severity} />
      </dd>
      <dt className="font-bold">Status</dt>
      <dd>{group.status === "open" ? "Open" : `Resolved${group.resolution_note ? `: ${group.resolution_note}` : ""}`}</dd>
      <dt className="font-bold">Happened</dt>
      <dd>
        {group.total_count} {group.total_count === 1 ? "time" : "times"}, first {DATE_TIME.format(new Date(group.first_seen_at))}, last {DATE_TIME.format(new Date(group.last_seen_at))}
      </dd>
      <dt className="font-bold">Kind</dt>
      <dd>
        {group.stage}
        {group.code ? ` · ${group.code}` : ""}
      </dd>
    </dl>
  );
}

function OccurrenceItem({ occurrence, emails }: { occurrence: ProblemOccurrence; emails: Map<string, string> }) {
  const hasTrace = Boolean(occurrence.detail && FRAME_PATTERN.test(occurrence.detail));
  return (
    <li className="grid gap-2 border-t border-line py-4">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold">{occurrence.reference}</span>
        <span className="type-small text-muted">{DATE_TIME.format(new Date(occurrence.occurred_at))}</span>
        <SeverityLabel severity={occurrence.severity} />
      </p>
      <p className="type-small text-muted">
        {getPerson({ occurrence, emails })}
        {occurrence.page_path ? ` · ${occurrence.page_path}` : ""}
        {occurrence.request_id ? ` · request ${occurrence.request_id}` : ""}
      </p>
      {occurrence.shown_message && <p>They saw: “{occurrence.shown_message}”</p>}
      {occurrence.detail && <pre className="type-small max-w-full overflow-x-auto whitespace-pre-wrap break-words bg-surface p-3 font-mono">{occurrence.detail}</pre>}
      {hasTrace && occurrence.detail && <TraceView reference={occurrence.reference} detail={occurrence.detail} />}
    </li>
  );
}

export default async function ProblemPage({ params, searchParams }: ProblemPageProps) {
  const [{ id }, { page: rawPage }] = await Promise.all([params, searchParams]);
  const admin = await requireAdminPage(OWNER_ROLES);
  const parsedId = z.uuid().safeParse(id);
  const page = getPageNumber(rawPage);
  if (!parsedId.success || page === null) return showPageNotFound({ admin, path: `/admin/problems/${id}` });
  const groupLoad = await fetchProblemGroup(admin, parsedId.data);
  if (groupLoad.isLoaded && !groupLoad.data) return showPageNotFound({ admin, path: `/admin/problems/${id}` });
  const occurrences = groupLoad.isLoaded && groupLoad.data ? await fetchProblemOccurrences(admin, { fingerprint: groupLoad.data.fingerprint, page }) : null;
  const users = await fetchAdminUsers(admin);
  const notice = await reportPageLoad({ admin, action: "problems.load", results: occurrences ? [groupLoad, occurrences, users.users] : [groupLoad, users.users] });
  const group = groupLoad.isLoaded ? groupLoad.data : null;
  const emails = new Map(users.users.isLoaded ? users.users.data.map((user) => [user.userId, user.email]) : []);
  const isPeopleMissing = !users.users.isLoaded;
  return (
    <>
      <TextLink href="/admin/problems">Back to problems</TextLink>
      <h1 className="type-h1 mt-4 mb-6">{group ? `${group.sectionLabel}: ${group.label}` : "Problem"}</h1>
      {!group || !occurrences?.isLoaded ? (
        <LoadProblem notice={notice} title="This problem didn't load" />
      ) : (
        <>
          <GroupSummary group={group} />
          {isPeopleMissing && <LoadProblem notice={notice} title="Names of the people involved didn't load" />}
          {group.status === "open" && <ResolveForm groupId={group.id} />}
          <h2 className="type-h2 mt-12 mb-2">Each time it happened</h2>
          <ul className="border-b border-line">
            {occurrences.data.occurrences.map((occurrence) => (
              <OccurrenceItem key={occurrence.id} occurrence={occurrence} emails={emails} />
            ))}
          </ul>
          <Pagination basePath={`/admin/problems/${group.id}`} currentPage={page} totalPages={getTotalPages(occurrences.data.totalCount, PROBLEM_OCCURRENCES_PAGE_SIZE)} />
        </>
      )}
    </>
  );
}
