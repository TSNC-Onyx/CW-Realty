import type { QuickResult } from "@/lib/admin/quick-result";
import type { ProblemAction } from "@/lib/observability/problem-catalog";

// When a one-click admin action's toast offers Undo (Admin §1). Safe in the browser.

/** onRun gets the action's own result (for example the record it changed); isOffered can hide Undo for a result. */
export type UndoOption<Result extends QuickResult> = {
  label: string;
  problemAction: ProblemAction;
  onRun: (result: Result) => Promise<QuickResult>;
  isOffered?: (result: Result) => boolean;
};

/**
 * Undo applies to a successful result. Only onRun itself returns success (a call that fails
 * outright becomes an error), so a successful result is always the action's own Result.
 */
export function getUndoOption<Result extends QuickResult>({ result, undo }: { result: Result | QuickResult; undo: UndoOption<Result> | undefined }): UndoOption<Result> | undefined {
  if (!undo || result.status !== "success") return undefined;
  const isOffered = undo.isOffered ? undo.isOffered(result as Result) : true;
  return isOffered ? undo : undefined;
}
