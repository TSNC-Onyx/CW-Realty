"use client";

import { useState } from "react";

import type { ActionState } from "@/lib/admin/action-state";

// A create form sends one key per attempt: a double-click or network retry reuses it,
// but after any reply the key changes, so a corrected or second submission is new.
export function useIdempotencyKey(initialKey: string, state: ActionState): string {
  const [key, setKey] = useState(initialKey);
  const [seenResponseId, setSeenResponseId] = useState(state.responseId);
  if (state.responseId !== seenResponseId) {
    setSeenResponseId(state.responseId);
    setKey(`${initialKey}-${state.responseId}`);
  }
  return key;
}
