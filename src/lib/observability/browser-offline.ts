// The browser's own word that it has no connection. A failure then is the person's network,
// not the site, so callers skip recording it (docs/false-alarm-cleanup-plan.md #4, #9).
export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
