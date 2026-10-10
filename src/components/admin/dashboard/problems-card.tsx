import { TextLink } from "@/components/ui/text-link";
import { MISSING_FIGURE } from "@/lib/admin/dashboard-figures";
import type { ProblemCounts } from "@/lib/admin/health/queries";
import type { LoadResult } from "@/lib/admin/load-result";

// Owners only: how many problems the site recorded in the last day, and how many were
// errors or worse (docs/cwr-error-tracking-plan.md). The rest are notes and warnings of
// many kinds, so the line doesn't guess which (docs/false-alarm-cleanup-plan.md).

function getSeriousText({ total, serious }: ProblemCounts): string {
  if (total === 0) return "Nothing went wrong.";
  if (serious === 0) return "None were errors.";
  return serious === 1 ? "1 was an error or worse." : `${serious} were errors or worse.`;
}

function getGroupsText(groups: number): string {
  return groups === 1 ? "1 distinct problem in all." : `${groups} distinct problems in all.`;
}

function getVisitorText(visitors: number): string {
  if (visitors === 0) return "Website visitors: none.";
  return visitors === 1 ? "Website visitors: 1 problem." : `Website visitors: ${visitors} problems.`;
}

export function ProblemsCard({ counts }: { counts: LoadResult<ProblemCounts> }) {
  return (
    <section aria-labelledby="problems-heading" className="grid content-start gap-2 border-t-2 border-ink bg-surface p-6">
      <h2 id="problems-heading" className="type-h3">
        Problems — last 24 hours
      </h2>
      <p className="type-h2 leading-none tabular-nums">{counts.isLoaded ? counts.data.total : MISSING_FIGURE}</p>
      <p className="text-tag leading-normal text-muted">{counts.isLoaded ? getSeriousText(counts.data) : "Didn't load — refresh to try again"}</p>
      {counts.isLoaded && <p className="text-tag leading-normal text-muted">{getVisitorText(counts.data.visitors)}</p>}
      {counts.isLoaded && counts.data.groups > 0 && <p className="text-tag leading-normal text-muted">{getGroupsText(counts.data.groups)}</p>}
      <TextLink href="/admin/problems">See problems</TextLink>
    </section>
  );
}
