import { getReference } from "@/lib/observability/reference";
import { getPathOnly, getScrubbedText } from "@/lib/observability/scrub";
import type { ProblemEvent, ProblemRecordResult } from "@/lib/observability/problem-types";

// Records one problem: a structured server-log line first (Workers Observability always has
// it), then the problem log in the database. Free of Next.js imports so the Worker's queue
// and scheduled handlers can use it. Never throws, and never reports its own failures.

/** The part of a service-role Supabase client this needs. */
export type ProblemDatabase = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

type StoredResponse = { reference: string | null; stored: boolean; suppressed: boolean };

const MAX_SHOWN_MESSAGE = 300;
const MAX_DETAIL = 2000;
const MAX_CODE = 64;
// A failed write already used part of the person's wait; the health mark gets a short slot.
const HEALTH_MARK_TIMEOUT_MS = 500;

class ProblemWriteTimeoutError extends Error {
  constructor(readonly context: { timeoutMs: number }) {
    super(`The problem log did not answer within ${context.timeoutMs} ms`);
    this.name = "ProblemWriteTimeoutError";
  }
}

function getRpcPayload(event: ProblemEvent, { id, reference }: { id: string; reference: string }): Record<string, unknown> {
  return {
    id,
    reference,
    tenant_id: event.tenantId ?? null,
    origin: event.origin,
    action: event.action,
    stage: event.stage,
    severity: event.severity,
    code: event.code?.slice(0, MAX_CODE) ?? null,
    shown_message: getScrubbedText(event.shownMessage, MAX_SHOWN_MESSAGE),
    detail: getScrubbedText(event.detail, MAX_DETAIL),
    actor_id: event.actorId ?? null,
    actor_role: event.actorRole ?? null,
    record_table: event.recordTable ?? null,
    record_id: event.recordId ?? null,
    request_id: event.requestId ?? null,
    page_path: getPathOnly(event.pagePath),
    release: event.release ?? null,
    digest: event.digest ?? null,
  };
}

function writeLogLine(payload: Record<string, unknown>, message: string): void {
  const line = JSON.stringify({ level: payload.severity, message, ...payload });
  if (payload.severity === "info") console.info(line);
  else console.error(line);
}

function withTimeout<Value>(promise: PromiseLike<Value>, timeoutMs: number): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ProblemWriteTimeoutError({ timeoutMs })), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

async function markLogUnhealthy({ db, tenantId, error, timeoutMs }: { db: ProblemDatabase; tenantId: string | null; error: unknown; timeoutMs: number }): Promise<void> {
  const reason = error instanceof Error ? error.name : "Unknown";
  const mark = db.rpc("touch_health_check", { p_name: "problem_log_writes", p_is_ok: false, p_error: `Problem log write failed: ${reason}`, p_tenant_id: tenantId });
  await withTimeout(mark, timeoutMs).catch(() => undefined);
}

async function storeProblem({ db, payload, timeoutMs }: { db: ProblemDatabase; payload: Record<string, unknown>; timeoutMs: number }): Promise<ProblemRecordResult> {
  const reference = payload.reference as string;
  const startedAtMs = Date.now();
  try {
    const { data, error } = await withTimeout(db.rpc("record_problem", { p: payload }), timeoutMs);
    if (error) throw new Error(error.code ?? error.message);
    const stored = data as StoredResponse;
    return { reference: stored.reference ?? reference, stored: stored.stored, isSuppressed: stored.suppressed };
  } catch (error) {
    writeLogLine(payload, error instanceof ProblemWriteTimeoutError ? "problem_log_write_slow" : "problem_log_write_failed");
    // The health mark only uses what is left of the time limit, so the whole wait stays within it.
    const remainingMs = Math.min(HEALTH_MARK_TIMEOUT_MS, timeoutMs - (Date.now() - startedAtMs));
    if (!(error instanceof ProblemWriteTimeoutError) && remainingMs > 0) await markLogUnhealthy({ db, tenantId: (payload.tenant_id as string | null) ?? null, error, timeoutMs: remainingMs });
    return { reference, stored: error instanceof ProblemWriteTimeoutError ? "unknown" : false, isSuppressed: false };
  }
}

/** db is null when the service key is missing: the problem then reaches the server log only. */
export async function recordProblem(
  db: ProblemDatabase | null,
  event: ProblemEvent,
  { id = crypto.randomUUID(), timeoutMs = 1500 }: { id?: string; timeoutMs?: number } = {},
): Promise<ProblemRecordResult> {
  const payload = getRpcPayload(event, { id, reference: getReference(id) });
  writeLogLine(payload, "problem");
  if (!db) return { reference: payload.reference as string, stored: false, isSuppressed: false };
  return storeProblem({ db, payload, timeoutMs });
}
