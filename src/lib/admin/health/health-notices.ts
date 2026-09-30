// Owner notices on the dashboard when a background check has gone quiet or keeps failing
// (docs/cwr-error-tracking-plan.md, "dead-man" checks). Same limits as cwr.check_stale_health,
// so the dashboard and the database agree. Pure, so it is tested without a database.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const PROBLEM_ALERTS_STALE_MS = 20 * MINUTE_MS;
const SCHEDULED_JOBS_STALE_MS = 45 * MINUTE_MS;
const PHOTO_CLEANUP_STALE_MS = 36 * HOUR_MS;
const FAILING_CHECK_NAMES = new Set<HealthCheckName>(["problem_alerts", "problem_log_writes"]);

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export type HealthCheckName = "problem_alerts" | "scheduled_jobs" | "photo_cleanup" | "problem_log_writes";

export type HealthCheck = {
  name: HealthCheckName;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
};

export type HealthNotice = { key: string; title: string; body: string };

type StaleRule = { name: HealthCheckName; maxAgeMs: number; getStamp: (check: HealthCheck) => string; title: string; getBody: (since: string) => string };

const STALE_RULES: StaleRule[] = [
  {
    name: "problem_alerts",
    maxAgeMs: PROBLEM_ALERTS_STALE_MS,
    getStamp: (check) => check.last_run_at ?? check.created_at,
    title: "Problem emails aren't being checked",
    getBody: (since) => `The check that emails you about problems last ran ${since}. Problems are still logged, but nobody is emailed about them. Ask your developer to check the website's scheduled tasks.`,
  },
  {
    name: "scheduled_jobs",
    maxAgeMs: SCHEDULED_JOBS_STALE_MS,
    getStamp: (check) => check.last_run_at ?? check.created_at,
    title: "Database clean-up checks aren't running",
    getBody: (since) => `The database's scheduled clean-ups last checked in ${since}. Old trash and expired items may pile up. Ask your developer to check the database's scheduled jobs.`,
  },
  {
    name: "photo_cleanup",
    maxAgeMs: PHOTO_CLEANUP_STALE_MS,
    getStamp: (check) => check.last_ok_at ?? check.created_at,
    title: "The nightly photo clean-up hasn't finished",
    getBody: (since) => `It last finished ${since}. Deleted photos may still be taking up storage. Ask your developer to check the nightly clean-up on GitHub.`,
  },
];

const FAILING_TITLES: Record<HealthCheckName, string> = {
  problem_alerts: "Problem emails are failing",
  problem_log_writes: "The problem log couldn't save a problem",
  scheduled_jobs: "Database clean-up checks are failing",
  photo_cleanup: "The nightly photo clean-up is failing",
};

function getWhenText(stamp: string): string {
  return `on ${DATE_TIME.format(new Date(stamp))}`;
}

function getStaleNotice({ check, now }: { check: HealthCheck; now: Date }): HealthNotice | null {
  const rule = STALE_RULES.find((candidate) => candidate.name === check.name);
  if (!rule) return null;
  const stamp = rule.getStamp(check);
  if (now.getTime() - new Date(stamp).getTime() <= rule.maxAgeMs) return null;
  return { key: `${check.name}-stale`, title: rule.title, body: rule.getBody(getWhenText(stamp)) };
}

// Failing: the last error is newer than the last success (or there was never a success).
function getFailingNotice(check: HealthCheck): HealthNotice | null {
  if (!FAILING_CHECK_NAMES.has(check.name) || !check.last_error_at) return null;
  const isFailing = !check.last_ok_at || new Date(check.last_error_at) > new Date(check.last_ok_at);
  if (!isFailing) return null;
  const reason = check.last_error ? ` What it said: “${check.last_error}”.` : "";
  return { key: `${check.name}-failing`, title: FAILING_TITLES[check.name], body: `The last try failed ${getWhenText(check.last_error_at)}.${reason} Ask your developer to look into it.` };
}

export function getHealthNotices({ checks, now }: { checks: HealthCheck[]; now: Date }): HealthNotice[] {
  return checks.flatMap((check) => [getStaleNotice({ check, now }), getFailingNotice(check)].filter((notice): notice is HealthNotice => notice !== null));
}
