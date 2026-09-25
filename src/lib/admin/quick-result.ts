// Result of a one-click admin action (reorder, hide, trash, restore).
export type QuickResult = { status: "success" | "error"; message: string };

export function getQuickSuccess(message: string): QuickResult {
  return { status: "success", message };
}

export function getQuickError(message: string): QuickResult {
  return { status: "error", message };
}
