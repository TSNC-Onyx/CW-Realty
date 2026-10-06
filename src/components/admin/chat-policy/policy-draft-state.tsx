"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode, type RefObject } from "react";

// What the Chatbot policy page's sections share (docs/cwr-chatbot-round-3-plan.md, bugs 11–12):
// whether the editor holds unsaved changes, whether a test run is going, and the open draft's
// saved text (for Undo after a restore). The server rules don't depend on this; it keeps the
// buttons honest about what they would test, publish, or restore.

type PolicyDraftState = {
  hasUnsavedChanges: boolean;
  /** The same value, for click handlers that must read it at click time (Undo). */
  unsavedChangesRef: RefObject<boolean>;
  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void;
  isRunning: boolean;
  setIsRunning: (isRunning: boolean) => void;
  /** The open draft's saved text, or null when no draft is open. */
  savedDraftText: string | null;
};

const PolicyDraftStateContext = createContext<PolicyDraftState | null>(null);

/** A component that needs the shared draft state was rendered outside the provider (a coding error). */
class MissingDraftStateError extends Error {
  constructor() {
    super("usePolicyDraftState must be used inside PolicyDraftStateProvider");
    this.name = "MissingDraftStateError";
  }
}

export function PolicyDraftStateProvider({ savedDraftText, children }: { savedDraftText: string | null; children: ReactNode }) {
  const [hasUnsavedChanges, setUnsavedState] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const unsavedChangesRef = useRef(false);
  const setHasUnsavedChanges = useCallback((isUnsaved: boolean) => {
    unsavedChangesRef.current = isUnsaved;
    setUnsavedState(isUnsaved);
  }, []);
  return <PolicyDraftStateContext value={{ hasUnsavedChanges, unsavedChangesRef, setHasUnsavedChanges, isRunning, setIsRunning, savedDraftText }}>{children}</PolicyDraftStateContext>;
}

export function usePolicyDraftState(): PolicyDraftState {
  const state = useContext(PolicyDraftStateContext);
  if (!state) throw new MissingDraftStateError();
  return state;
}
