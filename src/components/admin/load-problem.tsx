import { Message } from "@/components/ui/message";
import type { LoadProblemNotice } from "@/lib/admin/report-page-load";

// Shown in place of a part of an admin page whose data didn't load (Infra §3: fail
// gracefully, keep the rest of the page working). Never an empty list or a zero.
export function LoadProblem({ notice, title = "This part didn't load" }: { notice: LoadProblemNotice | null; title?: string }) {
  return (
    <Message tone="error" title={title}>
      <p>Refresh the page to try again. If it keeps happening, tell the site owner.</p>
      {notice && (
        <p className="mt-1">
          Reference: {notice.reference}
          {notice.isStored ? "" : " (may not be saved)"}
        </p>
      )}
    </Message>
  );
}
