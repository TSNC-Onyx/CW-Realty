// Browser crashes that don't mean the site is broken (docs/false-alarm-cleanup-plan.md #5):
// a tab left open across a site update asks for code that update replaced, and page
// translators or extensions change the page under React. Still recorded, as notes.

const OLD_CODE_PATTERN = /Failed to load chunk|Loading chunk \S+ failed/;
const PAGE_CHANGED_PATTERN = /Failed to execute '(removeChild|insertBefore)' on 'Node'/;

function isOldCodeError(error: Error): boolean {
  return error.name === "ChunkLoadError" || OLD_CODE_PATTERN.test(error.message);
}

function isPageChangedError(error: Error): boolean {
  return error.name === "NotFoundError" && PAGE_CHANGED_PATTERN.test(error.message);
}

export function isOutsideBrowserError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return isOldCodeError(error) || isPageChangedError(error);
}
