"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

// What the Chatbot policy page's sections share (docs/cwr-chatbot-round-3-plan.md, bugs 11–12):
// whether the editor holds unsaved changes, whether a test run is going, and the open draft's
// saved text (for Undo after a restore). The server rules don't depend on this; it keeps the
// buttons honest about what they would test, publish, or restore.

type PolicyDraftState = {
  /** The policy editor or the topic answers form holds unsaved text. */
  hasUnsavedChanges: boolean;
  /** The same value, for click handlers that must read it at click time (Undo). */
  unsavedChangesRef: RefObject<boolean>;
  /** The policy editor alone holds unsaved text (the topic answers form waits on it). */
  hasUnsavedPolicyText: boolean;
  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void;
  setHasUnsavedTopicAnswers: (hasUnsavedTopicAnswers: boolean) => void;
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

type UnsavedSources = { policyText: boolean; topicAnswers: boolean };

export function PolicyDraftStateProvider({ savedDraftText, children }: { savedDraftText: string | null; children: ReactNode }) {
  const [unsaved, setUnsaved] = useState<UnsavedSources>({ policyText: false, topicAnswers: false });
  const [isRunning, setIsRunning] = useState(false);
  const unsavedChangesRef = useRef(false);
  const hasUnsavedChanges = unsaved.policyText || unsaved.topicAnswers;
  useEffect(() => {
    unsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);
  const setUnsavedSource = useCallback((source: keyof UnsavedSources, isUnsaved: boolean) => setUnsaved((current) => ({ ...current, [source]: isUnsaved })), []);
  const setHasUnsavedChanges = useCallback((isUnsaved: boolean) => setUnsavedSource("policyText", isUnsaved), [setUnsavedSource]);
  const setHasUnsavedTopicAnswers = useCallback((isUnsaved: boolean) => setUnsavedSource("topicAnswers", isUnsaved), [setUnsavedSource]);
  const value = { hasUnsavedChanges, unsavedChangesRef, hasUnsavedPolicyText: unsaved.policyText, setHasUnsavedChanges, setHasUnsavedTopicAnswers, isRunning, setIsRunning, savedDraftText };
  return <PolicyDraftStateContext value={value}>{children}</PolicyDraftStateContext>;
}

export function usePolicyDraftState(): PolicyDraftState {
  const state = useContext(PolicyDraftStateContext);
  if (!state) throw new MissingDraftStateError();
  return state;
}
