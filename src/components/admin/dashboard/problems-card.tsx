import { MISSING_FIGURE } from "@/lib/admin/dashboard-figures";
import type { ProblemCounts } from "@/lib/admin/health/queries";
import type { LoadResult } from "@/lib/admin/load-result";

// Owners only: how many problems the site recorded in the last day, and how many were
// system faults rather than typing mistakes (docs/cwr-error-tracking-plan.md).

function getSeriousText({ total, serious }: ProblemCounts): string {
  if (total === 0) return "Nothing went wrong.";
  if (serious === 0) return "None were errors. Most are typing mistakes people fixed.";
  return serious === 1 ? "1 was an error or worse." : `${serious} were errors or worse.`;
}

export function ProblemsCard({ counts }: { counts: LoadResult<ProblemCounts> }) {
  return (
    <section aria-labelledby="problems-heading" className="grid content-start gap-2 border-t-2 border-ink bg-surface p-6">
      <h2 id="problems-heading" className="type-h3">
        Problems — last 24 hours
      </h2>
      <p className="type-h2 leading-none tabular-nums">{counts.isLoaded ? counts.data.total : MISSING_FIGURE}</p>
      <p className="text-tag leading-normal text-muted">{counts.isLoaded ? getSeriousText(counts.data) : "Didn't load — refresh to try again"}</p>
    </section>
  );
}
