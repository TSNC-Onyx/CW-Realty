import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoadProblem } from "@/components/admin/load-problem";
import { SeverityLabel } from "@/components/admin/problems/severity-label";
import { Pagination } from "@/components/content/pagination";
import { ButtonLink } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { EmptyState } from "@/components/ui/empty-state";
import { PROBLEM_GROUPS_PAGE_SIZE, fetchProblemGroupPage, fetchProblemSearch, getProblemFilters, getProblemListHref, type ProblemFilters, type ProblemGroupSummary } from "@/lib/admin/problems/queries";
import { showPageNotFound } from "@/lib/admin/record-page-not-found";
import { reportPageLoad } from "@/lib/admin/report-page-load";
import { OWNER_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { getPageNumber, getTotalPages } from "@/lib/content/page-number";

export const metadata: Metadata = { title: "Problems" };

// Owners only (decision D2): what went wrong on the site, grouped, with search by reference
// (docs/cwr-error-tracking-plan.md "Problems page"; docs/error-logging-a-grade-plan.md Phase D).

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const SEVERITY_OPTIONS = [
  { value: "all", label: "Any severity" },
  { value: "critical", label: "Critical" },
  { value: "error", label: "Error" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Note" },
];
const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "Open and resolved" },
];
const PERIOD_OPTIONS = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "Any time" },
];
const NOT_IN_LOG_MESSAGE =
  "Not in the log: it was only written to the server log. Search Cloudflare Workers Observability for it within 3 days (docs/runbooks/problem-alerts.md).";

type ProblemsPageProps = { searchParams: Promise<{ section?: string; severity?: string; status?: string; period?: string; page?: string; q?: string }> };

function FilterSelect({ name, label, value, options }: { name: string; label: string; value: string; options: { value: string; label: string }[] }) {
  return (
    <label className="grid gap-1 text-base font-bold">
      {label}
      <select name={name} defaultValue={value} className="field-input font-normal">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProblemFiltersForm({ filters, sections }: { filters: ProblemFilters; sections: { area: string; label: string }[] }) {
  const sectionOptions = [{ value: "all", label: "Every section" }, ...sections.map((section) => ({ value: section.area, label: section.label }))];
  return (
    <form method="get" action="/admin/problems" aria-label="Filter problems" className="mb-8 grid gap-4 md:grid-cols-5 md:items-end">
      <FilterSelect name="section" label="Section" value={filters.section} options={sectionOptions} />
      <FilterSelect name="severity" label="Severity" value={filters.severity} options={SEVERITY_OPTIONS} />
      <FilterSelect name="status" label="Status" value={filters.status} options={STATUS_OPTIONS} />
      <FilterSelect name="period" label="Last seen" value={filters.period} options={PERIOD_OPTIONS} />
      <button type="submit" className="btn btn-m btn-secondary">
        Show
      </button>
    </form>
  );
}

function ProblemSearchForm({ query }: { query: string }) {
  return (
    <form method="get" action="/admin/problems" role="search" className="mb-6 grid max-w-prose gap-2">
      <label htmlFor="problem-search" className="text-base font-bold">
        Find a reference code or request ID
      </label>
      <div className="flex gap-2">
        <input id="problem-search" name="q" defaultValue={query} placeholder="CWR-ABC-123" maxLength={128} className="field-input flex-1" />
        <button type="submit" className="btn btn-m btn-secondary">
          Find
        </button>
      </div>
    </form>
  );
}

function ProblemList({ groups }: { groups: ProblemGroupSummary[] }) {
  if (groups.length === 0) {
    return <EmptyState icon={CircleCheck} titleId="problems-empty" title="Nothing here" description="No problems match these filters. Try a longer period or another status." action={<ButtonLink href="/admin" size="m" variant="main">Back to dashboard</ButtonLink>} />;
  }
  return (
    <ul className="border-b border-line">
      {groups.map((group) => (
        <li key={group.id} className="border-t border-line">
          <Link href={`/admin/problems/${group.id}`} className="group grid gap-1 py-4 md:grid-cols-12 md:items-center">
            <span className="md:col-span-2">
              <SeverityLabel severity={group.max_severity} />
            </span>
            <span className="grid gap-1 md:col-span-6">
              <span className="font-semibold underline-offset-4 group-hover:underline">
                {group.sectionLabel}: {group.label}
              </span>
              {group.latestMessage && <span className="type-small text-muted">“{group.latestMessage}”</span>}
            </span>
            <span className="type-small text-muted md:col-span-2">
              {group.total_count} {group.total_count === 1 ? "time" : "times"}
              {group.status === "resolved" && " · resolved"}
            </span>
            <span className="type-small grid text-muted md:col-span-2">
              <span>Last {DATE_TIME.format(new Date(group.last_seen_at))}</span>
              <span>First {DATE_TIME.format(new Date(group.first_seen_at))}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function ProblemsPage({ searchParams }: ProblemsPageProps) {
  const params = await searchParams;
  const admin = await requireAdminPage(OWNER_ROLES);
  const page = getPageNumber(params.page);
  if (page === null) return showPageNotFound({ admin, path: "/admin/problems" });
  const query = params.q?.trim() ?? "";
  const search = query ? await fetchProblemSearch(admin, query) : null;
  if (search?.isLoaded && search.data.kind === "found") redirect(`/admin/problems/${search.data.groupId}`);
  const filters = getProblemFilters(params);
  const groupPage = await fetchProblemGroupPage(admin, { filters, page, now: new Date() });
  const notice = await reportPageLoad({ admin, action: "problems.load", results: search ? [groupPage, search] : [groupPage] });
  return (
    <>
      <h1 className="type-h1 mb-2">Problems</h1>
      <p className="type-lead mb-6 max-w-prose text-muted">What went wrong on the site, grouped so the same problem shows once. A resolved problem opens again by itself if it happens again.</p>
      <ProblemSearchForm query={query} />
      {search?.isLoaded && search.data.kind === "not_in_log" && <Message tone="info" title={NOT_IN_LOG_MESSAGE} />}
      {search?.isLoaded && search.data.kind === "no_match" && <Message tone="info" title="Nothing found for that reference or request ID." />}
      {search && !search.isLoaded && <LoadProblem notice={notice} title="The search didn't work" />}
      {groupPage.isLoaded ? (
        <>
          <ProblemFiltersForm filters={filters} sections={groupPage.data.sections} />
          <ProblemList groups={groupPage.data.groups} />
          <Pagination basePath={getProblemListHref(filters)} currentPage={page} totalPages={getTotalPages(groupPage.data.totalCount, PROBLEM_GROUPS_PAGE_SIZE)} />
        </>
      ) : (
        <LoadProblem notice={notice} title="Problems didn't load" />
      )}
    </>
  );
}
