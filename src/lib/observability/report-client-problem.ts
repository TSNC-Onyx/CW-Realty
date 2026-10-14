import { PROBLEM_REPORT_PATH, type ClientProblem, type ClientProblemReport } from "@/lib/observability/client-problem";
import { RELEASE } from "@/lib/observability/release";

// Browser side of problem reporting (docs/cwr-error-tracking-plan.md). Sends the report to
// the server; if the connection is down, keeps up to 20 reports in this browser and sends
// them on the next admin page load — only while the same person is signed in, so a report
// is never filed under someone else. Never reports its own failures and never throws.

type QueuedReport = { userId: string | null; report: ClientProblemReport };

const QUEUE_KEY = "cwr-problem-queue";
const MAX_QUEUED_REPORTS = 20;

let reporterUserId: string | null = null;

function readQueue(): QueuedReport[] {
  try {
    const stored = window.localStorage.getItem(QUEUE_KEY);
    return stored ? (JSON.parse(stored) as QueuedReport[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedReport[]): void {
  try {
    if (queue.length === 0) window.localStorage.removeItem(QUEUE_KEY);
    else window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUED_REPORTS)));
  } catch {
    // Private browsing or full storage: the person already saw the message on screen.
  }
}

async function postReport(report: ClientProblemReport): Promise<string | null> {
  const response = await fetch(PROBLEM_REPORT_PATH, {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { reference?: string };
  return body.reference ?? null;
}

function sendBeaconReport(report: ClientProblemReport): boolean {
  try {
    return navigator.sendBeacon(PROBLEM_REPORT_PATH, new Blob([JSON.stringify(report)], { type: "application/json" }));
  } catch {
    return false;
  }
}

/** Called by the admin frame (with the signed-in person) and the sign-in pages (null). */
export function setProblemReporterUser(userId: string | null): void {
  reporterUserId = userId;
}

/** Returns the reference code when the server stored the report. */
export async function reportClientProblem(problem: ClientProblem): Promise<string | null> {
  const report: ClientProblemReport = { ...problem, id: crypto.randomUUID(), pagePath: window.location.pathname, release: RELEASE ?? undefined };
  try {
    return await postReport(report);
  } catch {
    if (!sendBeaconReport(report)) writeQueue([...readQueue(), { userId: reporterUserId, report }]);
    return null;
  }
}

/**
 * A website visitor's browser report (docs/cwr-reliability-round-plan.md, Phase 1). Visitors
 * are anonymous, so nothing is kept for later and no reference code comes back to show.
 */
export async function reportVisitorClientProblem(problem: ClientProblem): Promise<void> {
  const report: ClientProblemReport = { ...problem, id: crypto.randomUUID(), pagePath: window.location.pathname, release: RELEASE ?? undefined };
  try {
    await postReport(report);
  } catch {
    sendBeaconReport(report);
  }
}

/** Sends reports kept while offline, if they belong to whoever is signed in now. */
export async function flushQueuedProblems(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;
  writeQueue([]);
  const ownReports = queue.filter((entry) => entry.userId === reporterUserId);
  const unsent: QueuedReport[] = [];
  for (const entry of ownReports) {
    const isSent = await postReport(entry.report).then(() => true, () => false);
    if (!isSent) unsent.push(entry);
  }
  writeQueue(unsent);
}
