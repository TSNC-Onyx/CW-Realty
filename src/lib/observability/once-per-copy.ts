// Notes decided by this deployment's own settings ("email not set up", "assistant not set up")
// are recorded once per running copy of the site, not once per visitor
// (docs/false-alarm-cleanup-plan.md #8). Same idea as src/lib/security/visitor-bot-check.ts.

const recordedKeys = new Set<string>();

/** True the first time a key is seen in this running copy; false after that. */
export function isFirstInThisCopy(key: string): boolean {
  if (recordedKeys.has(key)) return false;
  recordedKeys.add(key);
  return true;
}
