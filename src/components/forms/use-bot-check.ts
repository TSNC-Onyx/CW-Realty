"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";

import { isBrowserOffline } from "@/lib/observability/browser-offline";
import type { BrowserProblemCode, ClientProblem } from "@/lib/observability/client-problem";
import type { ProblemAction } from "@/lib/observability/problem-catalog";
import type { ProblemSeverity } from "@/lib/observability/problem-types";
import { areTestKeysAllowed, getTurnstileSiteKey, isTestSiteKey } from "@/lib/security/bot-check-key";

// The browser side of the Quick Check, shared by every form that has one
// (docs/cwr-reliability-round-plan.md §2.3–2.4; docs/cwr-stale-quick-check-addendum.md §4).
// A press of Send while the check is still running is held and sent the moment the check
// passes, so nobody is refused for being quick. A token older than 270 s (Cloudflare's limit
// is 300 s) is renewed first. A check that won't load is reported once and offers Try again.
// Only real failures are reported (docs/false-alarm-cleanup-plan.md #4): not a person who
// didn't tick in time, a tab left in the background, a glitch Cloudflare retries by itself,
// or a browser that is offline.

const CHECK_TIMEOUT_MS = 10_000;
const TOKEN_FRESH_MS = 270_000;
const IS_PRODUCTION_BUILD = process.env.NODE_ENV === "production";
// Cloudflare's error codes for a site key or domain set up wrong: never fixed by retrying
// (developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/).
const SETUP_ERROR_CODES = new Set(["110100", "110110", "110200", "400020", "400021", "400070"]);

/** checking · needs_click: Cloudflare asks for a tick · ready · failed: didn't load · unavailable: no site key */
export type BotCheckStatus = "checking" | "needs_click" | "ready" | "failed" | "unavailable";

type BotCheckOptions = {
  problemAction: ProblemAction;
  reportProblem: (problem: ClientProblem) => Promise<unknown>;
  /** A new value (each server reply) starts a fresh check: tokens work once. */
  resetKey: string;
  /** False while the form doesn't show the check (the chat after its first message). */
  isEnabled?: boolean;
};

type BotCheckProblem = { code: BrowserProblemCode; detail: string; severity?: ProblemSeverity };

export type BotCheckWidgetHandlers = {
  onSuccess: () => void;
  onExpire: () => void;
  onError: (errorCode: string) => void;
  onUnsupported: () => void;
  onTimeout: () => void;
  onBeforeInteractive: () => void;
  onAfterInteractive: () => void;
  onScriptError: () => void;
};

export type BotCheck = {
  siteKey: string | null;
  status: BotCheckStatus;
  /** A press of Send is waiting for the check; the form's fields are locked meanwhile. */
  isHolding: boolean;
  widgetKey: string;
  handlers: BotCheckWidgetHandlers;
  retry: () => void;
  /** True to send now; false when the press is held (it is sent once the check passes). */
  handleSubmitAttempt: (form: HTMLFormElement) => boolean;
};

function getInitialStatus(siteKey: string | null): BotCheckStatus {
  if (siteKey) return "checking";
  return IS_PRODUCTION_BUILD ? "unavailable" : "ready";
}

/** What a production page built without a working site key reports (once per page view). */
export function getSetupProblemCode(siteKey: string | null): BrowserProblemCode | null {
  if (!IS_PRODUCTION_BUILD) return null;
  if (!siteKey) return "missing_site_key";
  return isTestSiteKey(siteKey) && !areTestKeysAllowed() ? "test_site_key" : null;
}

/** A token still has a safe margin before Cloudflare's 5-minute limit. */
export function isTokenFresh({ tokenAt, now }: { tokenAt: number | null; now: number }): boolean {
  return tokenAt !== null && now - tokenAt < TOKEN_FRESH_MS;
}

function isFresh(tokenAt: number | null): boolean {
  return isTokenFresh({ tokenAt, now: Date.now() });
}

function subscribeToVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function getIsPageVisible(): boolean {
  return document.visibilityState === "visible";
}

function getIsPageVisibleOnServer(): boolean {
  return true;
}

/** The 10-second limit only counts while the check runs in view: a background tab is slowed down on purpose. */
export function isCheckTimerRunning({ isEnabled, status, isVisible }: { isEnabled: boolean; status: BotCheckStatus; isVisible: boolean }): boolean {
  return isEnabled && isVisible && status === "checking";
}

/** Cloudflare retries a widget error by itself, so only a setup error or a second error in a row is real. */
export function isLastingWidgetError({ errorCode, hasErroredBefore }: { errorCode: string; hasErroredBefore: boolean }): boolean {
  return hasErroredBefore || SETUP_ERROR_CODES.has(errorCode);
}

export function useBotCheck({ problemAction, reportProblem, resetKey, isEnabled = true }: BotCheckOptions): BotCheck {
  const siteKey = getTurnstileSiteKey();
  const [status, setStatus] = useState<BotCheckStatus>(() => getInitialStatus(siteKey));
  const [attempt, setAttempt] = useState(0);
  // A new value restarts the 10-second limit, giving Cloudflare's own retry a full window.
  const [checkWindow, setCheckWindow] = useState(0);
  const isVisible = useSyncExternalStore(subscribeToVisibility, getIsPageVisible, getIsPageVisibleOnServer);
  const [handledResetKey, setHandledResetKey] = useState(resetKey);
  const [isHolding, setIsHolding] = useState(false);
  const tokenAtRef = useRef<number | null>(null);
  const heldFormRef = useRef<HTMLFormElement | null>(null);
  const hasReportedRef = useRef(false);
  const hasWidgetErroredRef = useRef(false);

  // A new server reply remounts the widget (React "adjust state while rendering" pattern).
  if (resetKey !== handledResetKey) {
    setHandledResetKey(resetKey);
    if (siteKey) setStatus("checking");
  }

  const reportOnce = ({ code, detail, severity = "warning" }: BotCheckProblem) => {
    if (hasReportedRef.current) return;
    hasReportedRef.current = true;
    void reportProblem({ action: problemAction, stage: "browser", severity, code, detail });
  };

  const releaseHold = () => {
    heldFormRef.current = null;
    setIsHolding(false);
  };

  const showFailure = () => {
    tokenAtRef.current = null;
    setStatus("failed");
    releaseHold();
  };

  const fail = (problem: BotCheckProblem) => {
    showFailure();
    reportOnce(problem);
  };

  const retry = () => {
    tokenAtRef.current = null;
    hasWidgetErroredRef.current = false;
    setAttempt((current) => current + 1);
    if (siteKey) setStatus("checking");
  };

  useEffect(() => {
    tokenAtRef.current = null;
    hasWidgetErroredRef.current = false;
  }, [resetKey]);

  const reportSetupProblem = useEffectEvent(() => {
    const code = isEnabled ? getSetupProblemCode(siteKey) : null;
    if (code) reportOnce({ code, detail: "This page was built without a working Quick Check key." });
  });
  const handleCheckTimeout = useEffectEvent(() => fail({ code: "timeout", detail: "The Quick Check didn't finish within 10 seconds." }));
  const handleVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === "visible" && tokenAtRef.current !== null && !isFresh(tokenAtRef.current)) retry();
  });

  useEffect(() => reportSetupProblem(), [isEnabled]);

  useEffect(() => {
    if (!isCheckTimerRunning({ isEnabled, status, isVisible })) return;
    const timer = window.setTimeout(() => handleCheckTimeout(), CHECK_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isEnabled, status, isVisible, attempt, handledResetKey, checkWindow]);

  useEffect(() => {
    const listener = () => handleVisibilityChange();
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, []);

  const handleWidgetError = (errorCode: string) => {
    if (isLastingWidgetError({ errorCode, hasErroredBefore: hasWidgetErroredRef.current })) return fail({ code: "script_error", detail: `Quick Check error ${errorCode}` });
    hasWidgetErroredRef.current = true;
    setStatus("checking");
    setCheckWindow((current) => current + 1);
  };

  const handleScriptError = () => {
    if (isBrowserOffline()) return showFailure();
    fail({ code: "network", detail: "The Quick Check script didn't load." });
  };

  const handlers: BotCheckWidgetHandlers = {
    onSuccess: () => {
      tokenAtRef.current = Date.now();
      hasWidgetErroredRef.current = false;
      setStatus("ready");
      const heldForm = heldFormRef.current;
      releaseHold();
      heldForm?.requestSubmit();
    },
    onExpire: () => {
      tokenAtRef.current = null;
      setStatus("checking");
    },
    onError: handleWidgetError,
    onUnsupported: () => fail({ code: "unsupported", detail: "This browser can't run the Quick Check.", severity: "info" }),
    // Not ticked in time: Cloudflare shows a fresh tick box by itself (refresh-timeout: auto).
    onTimeout: () => setStatus("needs_click"),
    onBeforeInteractive: () => setStatus("needs_click"),
    onAfterInteractive: () => setStatus("checking"),
    onScriptError: handleScriptError,
  };

  const handleSubmitAttempt = (form: HTMLFormElement): boolean => {
    if (!isEnabled) return true;
    if (!siteKey) return !IS_PRODUCTION_BUILD;
    if (isFresh(tokenAtRef.current)) return true;
    heldFormRef.current = form;
    setIsHolding(true);
    if (tokenAtRef.current !== null || status === "failed") retry();
    return false;
  };

  return { siteKey, status, isHolding, widgetKey: `${handledResetKey}:${attempt}`, handlers, retry, handleSubmitAttempt };
}
