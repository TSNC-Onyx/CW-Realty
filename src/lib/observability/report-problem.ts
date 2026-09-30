import "server-only";

import { after } from "next/server";
import { headers } from "next/headers";

import { getCloudflareBinding } from "@/lib/platform/cloudflare-bindings";
import { getActionContext } from "@/lib/observability/action-context";
import { recordProblem, type ProblemDatabase } from "@/lib/observability/record-problem";
import { REQUEST_ID_HEADER } from "@/lib/observability/request-id";
import { getReference } from "@/lib/observability/reference";
import { isReferenceWorthy, type ProblemEvent, type ProblemOrigin, type ProblemRecordResult } from "@/lib/observability/problem-types";
import { createServiceClient, isServiceAccessConfigured } from "@/lib/supabase/service-client";

// Server-side entry point for recording a problem (docs/cwr-error-tracking-plan.md).
// Warnings and worse are written before the person is answered, so the reference they see
// is stored; typing mistakes are written after the response. Never throws.

export const VERSION_METADATA_BINDING = "CF_VERSION_METADATA";

/** problemId: set by callers that may retry (browser reports), so a retry is not counted twice. */
export type ServerProblem = Omit<ProblemEvent, "origin"> & { origin?: ProblemOrigin; problemId?: string };

type RequestFacts = { requestId: string | null; pagePath: string | null; release: string | null };

async function getRequestFacts(): Promise<RequestFacts> {
  const release = getCloudflareBinding<{ id?: string }>(VERSION_METADATA_BINDING)?.id ?? null;
  try {
    const headerStore = await headers();
    return { requestId: headerStore.get(REQUEST_ID_HEADER), pagePath: headerStore.get("referer"), release };
  } catch {
    return { requestId: null, pagePath: null, release };
  }
}

function getProblemDatabase(requestId: string | null): ProblemDatabase | null {
  return isServiceAccessConfigured() ? createServiceClient({ requestId }) : null;
}

function getCompleteEvent(problem: ServerProblem, facts: RequestFacts): ProblemEvent {
  const actor = getActionContext()?.actor ?? null;
  const tenantId = problem.tenantId ?? actor?.tenantId ?? null;
  const actorId = problem.actorId ?? actor?.actorId ?? null;
  return {
    ...problem,
    origin: problem.origin ?? (actorId ? "server_member" : "server_signin"),
    tenantId,
    actorId,
    actorRole: problem.actorRole ?? actor?.actorRole ?? null,
    requestId: problem.requestId ?? facts.requestId,
    pagePath: problem.pagePath ?? facts.pagePath,
    release: problem.release ?? facts.release,
  };
}

function recordAfterResponse({ db, event, id }: { db: ProblemDatabase | null; event: ProblemEvent; id: string }): ProblemRecordResult {
  const pending = recordProblem(db, event, { id });
  try {
    after(() => pending);
  } catch {
    // Outside a request (for example a build step): the write simply finishes on its own.
  }
  return { reference: getReference(id), stored: "unknown", isSuppressed: false };
}

export async function reportProblem(problem: ServerProblem): Promise<ProblemRecordResult> {
  const event = getCompleteEvent(problem, await getRequestFacts());
  const db = getProblemDatabase(event.requestId ?? null);
  const id = problem.problemId ?? crypto.randomUUID();
  if (!isReferenceWorthy(event.severity)) return recordAfterResponse({ db, event, id });
  return recordProblem(db, event, { id });
}
