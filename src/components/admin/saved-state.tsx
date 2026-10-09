"use client";

import { CircleAlert, CircleCheck, CircleDashed, type LucideIcon } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";

import { getSavedState, type SavedState, type SavedStateInput } from "@/lib/admin/saved-state";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Saved-state line under admin fields (owner choice 2026-10-09, Style §11.11): a quiet "Saved"
// with a green check, a stronger "Not saved yet" while a box differs from what's stored, and
// "Nothing saved" for a blank stored value. Fields show it only inside a SavedStateProvider, so
// sign-in and "add" forms look exactly as before.

export type VisibleSavedState = Exclude<SavedState, "none">;

/** Custom wording for one field (Ads & analytics names the live ID); null keeps the standard words. */
export type SavedStateText = (state: VisibleSavedState, current: string) => string | null;

type LineStyle = { icon: LucideIcon; iconClassName: string; textClassName: string; text: string };

const LINE_STYLES: Record<VisibleSavedState, LineStyle> = {
  saved: { icon: CircleCheck, iconClassName: "text-success", textClassName: "text-muted", text: "Saved" },
  unsaved: { icon: CircleAlert, iconClassName: "text-ink", textClassName: "font-semibold text-ink", text: "Not saved yet" },
  empty: { icon: CircleDashed, iconClassName: "text-muted", textClassName: "text-muted", text: "Nothing saved" },
};

const SavedStateContext = createContext<{ isNewItem: boolean } | null>(null);

export function SavedStateProvider({ isNewItem, children }: { isNewItem: boolean; children: ReactNode }) {
  return <SavedStateContext value={{ isNewItem }}>{children}</SavedStateContext>;
}

type SavedStateLineProps = { id: string; state: SavedState; current?: string; getText?: SavedStateText };

export function SavedStateLine({ id, state, current = "", getText }: SavedStateLineProps) {
  if (state === "none") return null;
  const style = LINE_STYLES[state];
  const Icon = style.icon;
  return (
    <p id={id} className={`type-small mt-1 flex items-start gap-2 ${style.textClassName}`}>
      <Icon aria-hidden size={ICON_SIZE.inline} className={`mt-0.5 shrink-0 ${style.iconClassName}`} />
      {getText?.(state, current) ?? style.text}
    </p>
  );
}

type FieldSavedStateOptions = Omit<SavedStateInput, "current" | "isNewItem">;

/** Joins the ids that describe a field, leaving out the parts it doesn't show. */
export function getDescribedBy(ids: (string | null | false | undefined)[]): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}

/** What's in a box outside a form: starts from the saved value and follows it after each save. */
export function useTypedValue(saved: string) {
  const [current, setCurrent] = useState(saved);
  const [seenSaved, setSeenSaved] = useState(saved);
  if (saved !== seenSaved) {
    setSeenSaved(saved);
    setCurrent(saved);
  }
  return [current, setCurrent] as const;
}

/** A field's typed value and saved state; null outside a SavedStateProvider. */
export function useFieldSavedState(options: FieldSavedStateOptions) {
  const context = useContext(SavedStateContext);
  const [current, setCurrent] = useState(options.saved);
  if (!context) return null;
  return { current, setCurrent, state: getSavedState({ ...options, current, isNewItem: context.isNewItem }) };
}
