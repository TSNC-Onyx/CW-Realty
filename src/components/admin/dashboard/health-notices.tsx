import { LoadProblem } from "@/components/admin/load-problem";
import { Message } from "@/components/ui/message";
import { getHealthNotices, type HealthCheck } from "@/lib/admin/health/health-notices";
import type { LoadResult } from "@/lib/admin/load-result";
import { ARE_PROBLEM_EMAILS_PAUSED } from "@/lib/jobs/problem-alert-schedule";
import type { LoadProblemNotice } from "@/lib/admin/report-page-load";

// Owners only: a notice for each background check that has gone quiet or keeps failing.

type HealthNoticesProps = { checks: LoadResult<HealthCheck[]>; problemRecipientCount: LoadResult<number>; now: Date; notice: LoadProblemNotice | null };

// Owner decision D4: until an owner chooses someone, problems are recorded but no one is emailed.
function NoProblemRecipientsNotice({ problemRecipientCount }: { problemRecipientCount: LoadResult<number> }) {
  if (ARE_PROBLEM_EMAILS_PAUSED) {
    return (
      <Message tone="info" title="Problem emails are paused">
        <p>Problems are still recorded. No one is emailed about them until emails resume.</p>
      </Message>
    );
  }
  if (!problemRecipientCount.isLoaded || problemRecipientCount.data > 0) return null;
  return (
    <Message tone="warning" title="No one gets problem emails yet">
      <p>Problems are still recorded. Switch someone on under Notifications → Send problem emails.</p>
    </Message>
  );
}

export function HealthNotices({ checks, problemRecipientCount, now, notice }: HealthNoticesProps) {
  if (!checks.isLoaded) return <LoadProblem notice={notice} title="Background checks didn't load" />;
  return (
    <>
      <NoProblemRecipientsNotice problemRecipientCount={problemRecipientCount} />
      {getHealthNotices({ checks: checks.data, now }).map((healthNotice) => (
        <Message key={healthNotice.key} tone="warning" title={healthNotice.title}>
          <p>{healthNotice.body}</p>
        </Message>
      ))}
    </>
  );
}
