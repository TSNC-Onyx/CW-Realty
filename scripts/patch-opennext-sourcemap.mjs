// Makes OpenNext's server bundle keep a source map (docs/error-logging-a-grade-plan.md, Phase C;
// owner approved 2026-10-10). OpenNext folds every server chunk into one handler.mjs without
// a map, which breaks the chain from the deployed Worker back to our source files. This adds
// `sourcemap: true` to that one esbuild call. Runs after every install and before every
// release build; idempotent. If OpenNext's code changes shape it says so clearly, so an upgrade
// can't silently lose readable server traces: after an install it only warns (installs and
// checks keep working); with --strict, as in `npm run release:build`, it stops the release.

import { readFileSync, writeFileSync } from "node:fs";

const IS_STRICT = process.argv.includes("--strict");

const TARGET = "node_modules/@opennextjs/cloudflare/dist/cli/build/bundle-server.js";
const ANCHOR = '        legalComments: "none",\n        metafile: true,';
const PATCHED = '        legalComments: "none",\n        sourcemap: true,\n        metafile: true,';

function readTarget() {
  try {
    return readFileSync(TARGET, "utf8");
  } catch {
    return null;
  }
}

const source = readTarget();
if (source === null) {
  console.warn(`patch-opennext-sourcemap: ${TARGET} not found (OpenNext not installed); skipped.`);
} else if (source.includes(PATCHED)) {
  console.log("patch-opennext-sourcemap: already applied.");
} else if (source.includes(ANCHOR)) {
  writeFileSync(TARGET, source.replace(ANCHOR, PATCHED));
  console.log("patch-opennext-sourcemap: applied.");
} else {
  console.error(`patch-opennext-sourcemap: OpenNext changed; update ${TARGET} handling in scripts/patch-opennext-sourcemap.mjs.`);
  if (IS_STRICT) process.exit(1);
}
