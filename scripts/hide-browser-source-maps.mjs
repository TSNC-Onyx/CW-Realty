// Runs after every `next build` (npm "postbuild"), including inside the Cloudflare build:
// moves the browser source maps out of .next/static, which is published as-is, into
// .next/private-source-maps, which never is (docs/error-logging-a-grade-plan.md, Phase C).
// scripts/store-source-maps.mjs then keeps them privately. Fails the build if any map
// would still be published, so source code can never leak by accident.

import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const PUBLIC_DIR = ".next/static";
const PRIVATE_DIR = ".next/private-source-maps/static";

function getMapFiles(directory) {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".map"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

rmSync(PRIVATE_DIR, { recursive: true, force: true });
const mapFiles = getMapFiles(PUBLIC_DIR);
for (const mapFile of mapFiles) {
  const destination = path.join(PRIVATE_DIR, path.relative(PUBLIC_DIR, mapFile));
  mkdirSync(path.dirname(destination), { recursive: true });
  renameSync(mapFile, destination);
}
if (getMapFiles(PUBLIC_DIR).length > 0) {
  console.error("hide-browser-source-maps: source maps are still in .next/static; stopping the build.");
  process.exit(1);
}
console.log(`hide-browser-source-maps: moved ${mapFiles.length} browser source maps out of the published files.`);
