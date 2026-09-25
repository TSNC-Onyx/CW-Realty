// Builds the admin photo encoder (src/workers/photo-encoder.ts) into a static Web Worker
// at public/photo-encoder/, next to the jSquash WebAssembly files it loads.
// Bundled with esbuild on its own because Next.js's bundler stalls on the codec's worker
// code (Phase 3 plan, decision 5). Runs before every `next build` and `next dev`.

import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { build } from "esbuild";

const OUTPUT_DIR = "public/photo-encoder";
const WASM_FILES = [
  "node_modules/@jsquash/avif/codec/enc/avif_enc.wasm",
  "node_modules/@jsquash/webp/codec/enc/webp_enc.wasm",
  "node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm",
];

rmSync(OUTPUT_DIR, { recursive: true, force: true });
mkdirSync(OUTPUT_DIR, { recursive: true });

await build({
  entryPoints: { "photo-encoder": "src/workers/photo-encoder.ts" },
  outdir: OUTPUT_DIR,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  logLevel: "warning",
  // The multi-threaded AVIF build needs cross-origin isolation, which the site does not
  // use; the single-threaded build is chosen at run time.
  external: ["*/avif_enc_mt.worker.mjs"],
});

WASM_FILES.forEach((file) => copyFileSync(file, path.join(OUTPUT_DIR, path.basename(file))));
console.log(`Photo encoder built in ${OUTPUT_DIR}`);
