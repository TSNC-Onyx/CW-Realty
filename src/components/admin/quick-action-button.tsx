"use client";

import { LoaderCircle, type LucideIcon } from "lucide-react";
import { useTransition } from "react";

import { useToast } from "@/components/admin/toast-provider";
import { getButtonClassName } from "@/components/ui/button-link";
import type { QuickResult } from "@/lib/admin/quick-result";
import { getUndoOption, type UndoOption } from "@/lib/admin/quick-undo";
import { callQuickAction } from "@/lib/observability/call-server-action";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// One-click admin action (reorder, hide, trash). Instead of a confirm pop-up, the result
// toast offers Undo where it makes sense (Admin §1).


type QuickActionButtonProps<Result extends QuickResult> = {
  label: string;
  accessibleLabel: string;
  icon: LucideIcon;
  /** Catalog name of the action, so a call that fails outright is recorded under it. */
  problemAction: ProblemAction;
  onRun: () => Promise<Result>;
  undo?: UndoOption<Result>;
  isDisabled?: boolean;
};


export function QuickActionButton<Result extends QuickResult = QuickResult>({ label, accessibleLabel, icon: Icon, problemAction, onRun, undo, isDisabled = false }: QuickActionButtonProps<Result>) {
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  const runUndo = ({ undoOption, result }: { undoOption: UndoOption<Result>; result: Result }) => {
    startTransition(async () => {
      const undoResult = await callQuickAction(undoOption.problemAction, () => undoOption.onRun(result));
      showToast({ tone: undoResult.status === "success" ? "success" : "error", title: undoResult.message });
    });
  };

  const handleClick = () =>
    startTransition(async () => {
      const result = await callQuickAction<Result>(problemAction, onRun);
      const undoOption = getUndoOption({ result, undo });
      showToast({
        tone: result.status === "success" ? "success" : "error",
        title: result.message,
        action: undoOption ? { label: undoOption.label, onClick: () => runUndo({ undoOption, result: result as Result }) } : undefined,
      });
    });

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      aria-busy={isPending}
      aria-label={accessibleLabel}
      className={`${getButtonClassName({ size: "s", variant: "secondary" })} px-3`}
    >
      {isPending ? <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" /> : <Icon aria-hidden size={ICON_SIZE.button} />}
      {label}
    </button>
  );
}
