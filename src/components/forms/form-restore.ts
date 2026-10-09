// Keeps what someone typed across a page refresh, for an out-of-date page
// (docs/cwr-stale-quick-check-addendum.md §3). This tab only (sessionStorage), removed as soon
// as it is put back, dropped after 10 minutes. Passwords and Quick Check tokens are never
// passed in. Storage can be blocked (private windows), so every read and write is guarded
// and the refresh still happens without it.

const RESTORE_KEY_PREFIX = "cwr-form-restore:";
const REFRESHED_AT_KEY = "cwr-page-refreshed-at";
const MAX_RESTORE_AGE_MS = 10 * 60 * 1000;
const REFRESH_LOOP_WINDOW_MS = 60 * 1000;

type SavedForm = { savedAt: number; values: Record<string, string> };

function isSavedForm(value: unknown): value is SavedForm {
  return typeof value === "object" && value !== null && typeof (value as SavedForm).savedAt === "number" && typeof (value as SavedForm).values === "object";
}

function takeSavedForm(formId: string): SavedForm | null {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(`${RESTORE_KEY_PREFIX}${formId}`) ?? "null");
    window.sessionStorage.removeItem(`${RESTORE_KEY_PREFIX}${formId}`);
    return isSavedForm(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Not saved: the refresh still fixes the page; the person types again.
  }
}

/**
 * The values saved before a refresh, once: only fields that still exist with the same name
 * (a release may rename them), and only if saved in the last 10 minutes.
 */
export function takeRestoredValues({ formId, fieldNames }: { formId: string; fieldNames: readonly string[] }): Record<string, string> | null {
  const saved = takeSavedForm(formId);
  if (!saved || Date.now() - saved.savedAt > MAX_RESTORE_AGE_MS) return null;
  const entries = fieldNames.filter((name) => typeof saved.values[name] === "string").map((name) => [name, saved.values[name] as string]);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/** True when this tab already refreshed itself in the last minute: refreshing again won't help. */
export function isRefreshLoop(): boolean {
  try {
    const refreshedAt = Number(window.sessionStorage.getItem(REFRESHED_AT_KEY) ?? 0);
    return Date.now() - refreshedAt < REFRESH_LOOP_WINDOW_MS;
  } catch {
    return false;
  }
}

/** Saves the typed values, notes the time (for the loop guard), and reloads the page. */
export function refreshKeepingValues({ formId, values }: { formId: string; values: Record<string, string> }): void {
  writeSessionValue(`${RESTORE_KEY_PREFIX}${formId}`, JSON.stringify({ savedAt: Date.now(), values } satisfies SavedForm));
  writeSessionValue(REFRESHED_AT_KEY, String(Date.now()));
  window.location.reload();
}
