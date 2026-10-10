import type { ProblemDatabase } from "@/lib/observability/record-problem";

// Problems the database couldn't take are kept on the alert queue and written later
// (docs/error-logging-a-grade-plan.md, Phase A). Only warnings and worse are kept, within a
// daily budget, so a long outage can't use up the free plan's queue allowance. Free of
// Next.js imports: the queue consumer in worker.ts runs it too.

export const PROBLEM_RETRY_KIND = "record_problem";
// Cloudflare keeps queue messages 24 hours on the free plan; five waits fit well inside it.
const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 43_200] as const;
const LONGEST_DELAY_SECONDS = 43_200;
// Each kept problem costs about 10 queue operations over its retries; the free plan allows
// 10,000 a day across the account, so this leaves most of it for alert emails.
const DAILY_RETRY_BUDGET = 300;
const RETRIED_SEVERITIES = new Set(["warning", "error", "critical"]);

/** payload: the exact record_problem input, with its id, so a retry can't count it twice. */
export type ProblemRetryJob = { kind: typeof PROBLEM_RETRY_KIND; payload: Record<string, unknown> };

export type ProblemRetryQueue = { send: (job: ProblemRetryJob) => Promise<unknown> };

const budget = { day: "", count: 0 };

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasBudgetLeft(): boolean {
  const today = getToday();
  if (budget.day !== today) {
    budget.day = today;
    budget.count = 0;
  }
  return budget.count < DAILY_RETRY_BUDGET;
}

export function isProblemRetryJob(job: unknown): job is ProblemRetryJob {
  return typeof job === "object" && job !== null && (job as { kind?: unknown }).kind === PROBLEM_RETRY_KIND;
}

export function isRetriedSeverity(severity: unknown): boolean {
  return typeof severity === "string" && RETRIED_SEVERITIES.has(severity);
}

/** Seconds to wait before retry number `attempt` (1-based): 1 min, 5 min, 30 min, 2 h, 12 h. */
export function getProblemRetryDelaySeconds(attempt: number): number {
  const index = Math.min(Math.max(attempt, 1), RETRY_DELAYS_SECONDS.length) - 1;
  return RETRY_DELAYS_SECONDS[index] ?? LONGEST_DELAY_SECONDS;
}

/** True when the problem was handed to the queue; false when it stays in the server log only. */
export async function queueProblemRetry({ queue, payload }: { queue: ProblemRetryQueue | null; payload: Record<string, unknown> }): Promise<boolean> {
  if (!queue || !isRetriedSeverity(payload.severity) || !hasBudgetLeft()) return false;
  budget.count += 1;
  return queue.send({ kind: PROBLEM_RETRY_KIND, payload }).then(
    () => true,
    () => false,
  );
}

/** A kept problem that still couldn't be written after a day stays in the server log only. */
export function logAbandonedProblem(job: ProblemRetryJob): void {
  console.error(JSON.stringify({ level: "error", message: "problem_log_retry_abandoned", ...job.payload }));
}

/** Writes a kept problem. Throws when the database still can't take it, so the queue retries. */
export async function storeRetriedProblem({ db, job }: { db: ProblemDatabase; job: ProblemRetryJob }): Promise<void> {
  const { error } = await db.rpc("record_problem", { p: job.payload });
  if (error) throw new Error(`The problem log is still unavailable (${error.code ?? error.message})`);
}
