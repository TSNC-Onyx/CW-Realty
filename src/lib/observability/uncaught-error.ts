import { isOutsideBrowserError } from "@/lib/observability/browser-noise";
import type { BrowserProblemCode } from "@/lib/observability/client-problem";
import type { ProblemSeverity } from "@/lib/observability/problem-types";

// What a page's error watcher reports about a browser error nobody caught: shared by the
// admin (src/components/admin/problem-reporter.tsx) and the public site
// (src/components/content/visitor-problem-reporter.tsx). Errors from our own code count as
// errors; errors from extensions or other scripts, old code after a site update, and page
// translators are only noted. Each distinct error is reported once per browser session.

const SEEN_KEY = "cwr-problem-seen";
const OWN_CODE_MARKER = "/_next/";
const MAX_SEEN = 50;
const MAX_DETAIL = 2000;

export type UncaughtReport = { code: BrowserProblemCode; severity: ProblemSeverity; detail: string };

/** False when this browser session already reported the same error. */
export function isFirstSighting(signature: string): boolean {
  try {
    const seen = new Set<string>(JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
    if (seen.has(signature)) return false;
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, signature].slice(-MAX_SEEN)));
    return true;
  } catch {
    return true;
  }
}

export function getErrorSignature(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** source: the script file the browser named for the error, when it named one. */
export function getUncaughtReport({ error, source }: { error: unknown; source: string }): UncaughtReport {
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  const isOwnCode = `${stack}\n${source}`.includes(OWN_CODE_MARKER);
  const code = error instanceof Error && error.name === "ChunkLoadError" ? "chunk_load" : "script_error";
  const severity = isOwnCode && !isOutsideBrowserError(error) ? "error" : "info";
  return { code, severity, detail: `${getErrorSignature(error)}\n${stack}`.slice(0, MAX_DETAIL) };
}
