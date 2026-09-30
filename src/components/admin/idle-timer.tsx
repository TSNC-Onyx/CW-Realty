"use client";

import { useEffect, useRef, type RefObject } from "react";

import { useToast } from "@/components/admin/toast-provider";
import { getLogoutPath } from "@/lib/admin/paths";
import { IDLE_LIMIT_MS, IDLE_WARNING_MS } from "@/lib/admin/session-timing";
import { getHttpProblemCode, type BrowserProblemCode } from "@/lib/observability/client-problem";
import { reportClientProblem } from "@/lib/observability/report-client-problem";

// Admin §7: sessions end after 30 minutes without activity. While someone types or
// clicks, the tab tells the server every few minutes; when they stop, a warning shows
// at 28 minutes and the tab signs out at 30. Three keep-alive failures in a row are
// recorded once, since a single missed ping is harmless.

const KEEP_ALIVE_PATH = "/admin/keep-alive";
const KEEP_ALIVE_EVERY_MS = 5 * 60 * 1000;
const CHECK_EVERY_MS = 15 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "input"] as const;
// Shared by every open admin tab, so an idle tab never signs out the one in use.
const SHARED_ACTIVITY_KEY = "cwr-admin-last-activity";
const KEEP_ALIVE_FAILURE_LIMIT = 3;

type KeepAliveFailure = { code: BrowserProblemCode; detail: string };

function readSharedActivity(): number {
  try {
    return Number(window.localStorage.getItem(SHARED_ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeSharedActivity(timeMs: number): void {
  try {
    window.localStorage.setItem(SHARED_ACTIVITY_KEY, String(timeMs));
  } catch {
    return;
  }
}

// Sign-out accepts POST only (no cross-site sign-out links), so the tab submits a form.
function submitSignOut(): void {
  const form = document.createElement("form");
  form.method = "post";
  form.action = getLogoutPath("timeout");
  document.body.append(form);
  form.submit();
}

async function fetchKeepAliveFailure(): Promise<KeepAliveFailure | null> {
  try {
    const response = await fetch(KEEP_ALIVE_PATH, { method: "POST", credentials: "same-origin" });
    return response.ok ? null : { code: getHttpProblemCode(response.status), detail: `HTTP ${response.status}` };
  } catch (error) {
    return { code: "network", detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

// Counts failures in a row; reports only when the count reaches the limit, and a success resets it.
function handleKeepAliveResult({ failure, failureCountRef }: { failure: KeepAliveFailure | null; failureCountRef: RefObject<number> }): void {
  if (!failure) {
    failureCountRef.current = 0;
    return;
  }
  failureCountRef.current += 1;
  if (failureCountRef.current !== KEEP_ALIVE_FAILURE_LIMIT) return;
  void reportClientProblem({ action: "portal.keep_alive", stage: "network", severity: "warning", code: failure.code, detail: failure.detail });
}

function sendKeepAlive(failureCountRef: RefObject<number>): void {
  void fetchKeepAliveFailure().then((failure) => handleKeepAliveResult({ failure, failureCountRef }));
}

export function IdleTimer() {
  const { showToast } = useToast();
  const lastActivityRef = useRef(0);
  const lastKeepAliveRef = useRef(0);
  const hasWarnedRef = useRef(false);
  const keepAliveFailureCountRef = useRef(0);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    lastKeepAliveRef.current = Date.now();
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      writeSharedActivity(lastActivityRef.current);
      hasWarnedRef.current = false;
      if (Date.now() - lastKeepAliveRef.current < KEEP_ALIVE_EVERY_MS) return;
      lastKeepAliveRef.current = Date.now();
      sendKeepAlive(keepAliveFailureCountRef);
    };
    const checkIdle = () => {
      const idleMs = Date.now() - Math.max(lastActivityRef.current, readSharedActivity());
      if (idleMs >= IDLE_LIMIT_MS) return submitSignOut();
      if (idleMs < IDLE_WARNING_MS || hasWarnedRef.current) return;
      hasWarnedRef.current = true;
      showToast({
        tone: "warning",
        title: "You'll be signed out in 2 minutes",
        body: "Nothing has changed for a while. Stay signed in to keep working.",
        action: { label: "Stay signed in", onClick: handleActivity },
      });
    };
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));
    const intervalId = window.setInterval(checkIdle, CHECK_EVERY_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      window.clearInterval(intervalId);
    };
  }, [showToast]);

  return null;
}
