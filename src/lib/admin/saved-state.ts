// Saved-state line under admin fields (owner choice 2026-10-09, docs/cwr-ads-analytics-review-plan.md
// Part B): compares what's in a box with what the server stored, the way the server cleans it up.

/** saved: matches the stored value; unsaved: changed since; empty: nothing stored; none: new item, untouched. */
export type SavedState = "saved" | "unsaved" | "empty" | "none";

export type SavedStateInput = {
  current: string;
  saved: string;
  isNewItem?: boolean;
  /** For values the server stores in one letter case (IDs, emails, state, web addresses). */
  isCaseInsensitive?: boolean;
  /** For a box that shows a stand-in when nothing is stored (an unassigned conversation). */
  isSavedBlank?: boolean;
};

function getComparable({ value, isCaseInsensitive }: { value: string; isCaseInsensitive: boolean }): string {
  const trimmed = value.trim();
  return isCaseInsensitive ? trimmed.toLowerCase() : trimmed;
}

export function getSavedState({ current, saved, isNewItem = false, isCaseInsensitive = false, isSavedBlank }: SavedStateInput): SavedState {
  const isChanged = getComparable({ value: current, isCaseInsensitive }) !== getComparable({ value: saved, isCaseInsensitive });
  if (isChanged) return "unsaved";
  if (isNewItem) return "none";
  const isBlank = isSavedBlank ?? saved.trim() === "";
  return isBlank ? "empty" : "saved";
}
