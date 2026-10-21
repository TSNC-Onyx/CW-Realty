import "server-only";

import { reportProblem } from "@/lib/observability/report-problem";
import type { ProblemSeverity } from "@/lib/observability/problem-types";
import { DEFAULT_TAG_SCRIPT_ORIGIN, getTagScriptUrl } from "@/lib/tracking/data-layer";

// Whether Google serves a published Tag Manager container (docs/cwr-ads-analytics-fixes-plan.md,
// D1, D2, D14). Asked when the owner saves and each time the page opens, never stored, and never
// a reason to refuse a save: the owner may publish right after saving.

const CHECK_TIMEOUT_MS = 3000;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
// Tests point the check at this computer so they never contact Google (D2); production ignores
// any other address.
const LOCAL_CHECK_HOSTS = new Set(["127.0.0.1", "localhost"]);

export type ContainerStatus = "published" | "not_found" | "unknown";

/** A saved container and what Google said about it; null when no container is saved. */
export type ContainerCheck = { containerId: string; status: ContainerStatus } | null;

type ContainerAction = "tracking.save" | "tracking.load";

type ContainerProblem = { severity: ProblemSeverity; code: string };

const CONTAINER_PROBLEMS: Record<Exclude<ContainerStatus, "published">, ContainerProblem> = {
  not_found: { severity: "warning", code: "container_not_published" },
  unknown: { severity: "info", code: "container_check_unreachable" },
};

/** Google's script address, or a test address on this computer (TAG_MANAGER_CHECK_ORIGIN). */
export function getContainerCheckOrigin(value: string | undefined): string {
  if (!value) return DEFAULT_TAG_SCRIPT_ORIGIN;
  try {
    const url = new URL(value);
    return LOCAL_CHECK_HOSTS.has(url.hostname) ? url.origin : DEFAULT_TAG_SCRIPT_ORIGIN;
  } catch {
    return DEFAULT_TAG_SCRIPT_ORIGIN;
  }
}

function getStatusFromAnswer(httpStatus: number): ContainerStatus {
  if (httpStatus === HTTP_OK) return "published";
  if (httpStatus === HTTP_NOT_FOUND) return "not_found";
  return "unknown";
}

export async function fetchContainerStatus(containerId: string): Promise<ContainerStatus> {
  const scriptOrigin = getContainerCheckOrigin(process.env.TAG_MANAGER_CHECK_ORIGIN);
  try {
    // no-store: the answer changes as soon as the owner publishes or unpublishes.
    const response = await fetch(getTagScriptUrl({ containerId, scriptOrigin }), { cache: "no-store", signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    await response.body?.cancel();
    return getStatusFromAnswer(response.status);
  } catch {
    // A network error or no answer within the limit: "couldn't check" is the defined result (D1).
    return "unknown";
  }
}

/** Records the warning the owner is shown (D14); a published container records nothing. */
export async function reportContainerStatus({ action, status }: { action: ContainerAction; status: ContainerStatus }): Promise<void> {
  if (status === "published") return;
  await reportProblem({ action, stage: "external", ...CONTAINER_PROBLEMS[status] });
}

/** Asks Google about the saved container and records the warning shown for it, if any. */
export async function checkSavedContainer({ containerId, action }: { containerId: string | null; action: ContainerAction }): Promise<ContainerCheck> {
  if (!containerId) return null;
  const status = await fetchContainerStatus(containerId);
  await reportContainerStatus({ action, status });
  return { containerId, status };
}
