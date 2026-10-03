import type { RequestFormAction } from "@/components/forms/use-request-form";
import { getFieldValues, getResultState } from "@/lib/forms/form-state";
import type { FormFieldConfig } from "@/lib/forms/request-forms";
import { withCallReportingFor } from "@/lib/observability/call-server-action";
import type { ProblemAction } from "@/lib/observability/problem-catalog";

// A public form's server action, wrapped so a call that fails before reaching the server
// (the site was updated while the page was open, or the connection dropped) becomes "didn't
// send" with the visitor's text kept, never a crash screen — and is recorded
// (docs/cwr-stale-quick-check-addendum.md §2). An out-of-date page offers Refresh page.

type RequestFormReporting = { problemAction: Extract<ProblemAction, `site.${string}`>; fields: FormFieldConfig[] };

export function withRequestFormReporting({ problemAction, fields }: RequestFormReporting, action: RequestFormAction): RequestFormAction {
  return withCallReportingFor(
    {
      action: problemAction,
      mode: "visitor",
      onFailure: (failure, formData) => getResultState({ status: "failed", values: getFieldValues(formData, fields), recovery: failure.code === "stale_page" ? "refresh" : null }),
    },
    action,
  );
}
