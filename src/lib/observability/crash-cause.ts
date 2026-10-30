// How a server crash on an admin page is recorded (instrumentation.ts, docs/cwr-error-tracking-plan.md).

// The browser left before the page finished streaming (closed the tab, clicked elsewhere):
// noted, never treated as a crash that emails the owner.
const CLIENT_LEFT_PATTERN = /destination stream closed early|aborted|ECONNRESET/i;
// Thrown after its problem was already recorded where it happened (for example an access-check
// outage). Log rows can't be changed, so the crash screen's digest gets a note pointing to that
// record instead of a second error (docs/false-alarm-cleanup-plan.md #7). Notes are written after
// the response, so a crash screen that reports faster still records its own copy; that is rare.
const ALREADY_RECORDED_NAME = "ReportedProblemError";

export type CrashCause = { stage: "network" | "unexpected"; severity: "info" | "error"; code: string; detail: string };

function getRecordedReference(crash: Error): string {
  const reference = (crash as Error & { context?: { reference?: unknown } }).context?.reference;
  return typeof reference === "string" ? reference : "an earlier record";
}

/** A public page: the error's name and our code locations only, as a message can repeat what a visitor typed. */
export function getVisitorCrashCause({ crash, stackFrames }: { crash: Error; stackFrames: string }): CrashCause {
  const cause = getCrashCause({ crash, stackFrames });
  return { ...cause, detail: [crash.name, stackFrames].filter(Boolean).join("\n") };
}

export function getCrashCause({ crash, stackFrames }: { crash: Error; stackFrames: string }): CrashCause {
  if (crash.name === ALREADY_RECORDED_NAME) return { stage: "unexpected", severity: "info", code: "already_recorded", detail: `Already recorded as ${getRecordedReference(crash)}: ${crash.message}` };
  if (CLIENT_LEFT_PATTERN.test(crash.message) || crash.name === "AbortError") return { stage: "network", severity: "info", code: "client_left", detail: `${crash.message}\n${stackFrames}` };
  return { stage: "unexpected", severity: "error", code: crash.name, detail: `${crash.message}\n${stackFrames}` };
}
