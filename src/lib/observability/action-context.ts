import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import type { ProblemAction } from "@/lib/observability/problem-catalog";
import type { ProblemSeverity, ProblemStage } from "@/lib/observability/problem-types";

// Per-request memory for the admin action being run: which action it is, who is running it,
// and the underlying cause of a failure (noted where it happens, reported by the wrapper).

/** reference is set when the problem was already recorded where it happened. */
export type ProblemCause = { stage: ProblemStage; severity: ProblemSeverity; code: string | null; detail: string | null; reference?: string };

export type ActionActor = { tenantId: string; actorId: string; actorRole: string };

type ActionContextStore = { action: ProblemAction; actor: ActionActor | null; cause: ProblemCause | null };

const actionContextStorage = new AsyncLocalStorage<ActionContextStore>();

export function runInActionContext<Result>(action: ProblemAction, work: () => Promise<Result>): Promise<Result> {
  return actionContextStorage.run({ action, actor: null, cause: null }, work);
}

export function getActionContext(): ActionContextStore | null {
  return actionContextStorage.getStore() ?? null;
}

export function setActionActor(actor: ActionActor): void {
  const store = actionContextStorage.getStore();
  if (store) store.actor = actor;
}

/** Remembers why the current action is about to fail. A no-op outside an admin action. */
export function noteProblemCause(cause: ProblemCause): void {
  const store = actionContextStorage.getStore();
  if (store) store.cause = cause;
}

export function takeProblemCause(): ProblemCause | null {
  const store = actionContextStorage.getStore();
  if (!store) return null;
  const { cause } = store;
  store.cause = null;
  return cause;
}
