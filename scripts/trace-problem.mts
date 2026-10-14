// Prints a problem's stack trace read back to our source files (docs/error-logging-a-grade-plan.md,
// Phase C). Owners use "Show the code location" on the Problems page; this is the same reading
// for a terminal:
//   SOURCE_MAPS_SUPABASE_URL=… SOURCE_MAPS_SERVICE_KEY=… npm run problem:trace -- CWR-ABC-123

import { gunzipSync } from "node:zlib";

import { createClient } from "@supabase/supabase-js";

import { getDecodedFrames, type ReleaseMaps } from "../src/lib/observability/trace-decode.ts";

const BUCKET = "source-maps";
const REFERENCE_PATTERN = /^CWR-[0-9A-Z]{3}-[0-9A-Z]{3}$/;

type ProblemRow = { reference: string; release: string | null; detail: string | null };

async function fetchMapFile(storage: ReturnType<ReturnType<typeof createClient>["storage"]["from"]>, objectPath: string): Promise<unknown> {
  const { data, error } = await storage.download(objectPath);
  if (error || !data) throw new Error(`No source maps at ${objectPath} (${error?.message ?? "missing"})`);
  return JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8"));
}

async function printTrace(reference: string): Promise<void> {
  const client = createClient(process.env.SOURCE_MAPS_SUPABASE_URL ?? "", process.env.SOURCE_MAPS_SERVICE_KEY ?? "", { auth: { persistSession: false } });
  const { data, error } = await client.schema("cwr").from("problem_events").select("reference, release, detail").eq("reference", reference).maybeSingle<ProblemRow>();
  if (error || !data) throw new Error(`Problem ${reference} not found (${error?.message ?? "no row"})`);
  if (!data.release || !data.detail) throw new Error(`Problem ${reference} has no release or no stack trace to read back`);
  const storage = client.storage.from(BUCKET);
  const [browser, server] = await Promise.all([fetchMapFile(storage, `${data.release}/browser.json.gz`), fetchMapFile(storage, `${data.release}/server.json.gz`)]);
  const { worker, chunks } = server as Pick<ReleaseMaps, "worker" | "chunks">;
  for (const frame of getDecodedFrames({ detail: data.detail, maps: { browser: browser as ReleaseMaps["browser"], worker, chunks } })) {
    console.log(`${frame.isDecoded ? "  " : "? "}${frame.name || "(anonymous)"}  ${frame.location}`);
  }
}

const reference = process.argv[2] ?? "";
if (!REFERENCE_PATTERN.test(reference)) {
  console.error("Usage: npm run problem:trace -- CWR-ABC-123");
  process.exit(1);
}
await printTrace(reference).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
