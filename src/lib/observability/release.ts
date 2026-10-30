// The commit this copy of the site was built from (docs/error-logging-a-grade-plan.md, Phase C):
// set at build by next.config.ts from Cloudflare Workers Builds. Problems carry it, so their
// stack traces are read back with that build's source maps. Null on local builds.

const RELEASE_PATTERN = /^[0-9a-f]{7,40}$/;

function getBuiltRelease(): string | null {
  const release = process.env.NEXT_PUBLIC_RELEASE ?? "";
  return RELEASE_PATTERN.test(release) ? release : null;
}

export const RELEASE = getBuiltRelease();

/** A release id sent by a browser: kept only when it looks like a commit id. */
export function getValidRelease(release: string | undefined): string | null {
  return release && RELEASE_PATTERN.test(release) ? release : null;
}
