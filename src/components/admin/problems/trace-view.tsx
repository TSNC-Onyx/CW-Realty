"use client";

import { Code, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { Message } from "@/components/ui/message";
import { getButtonClassName } from "@/components/ui/button-link";
import { fetchProblemTraceMapsAction } from "@/lib/admin/problems/actions";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { callQuickAction } from "@/lib/observability/call-server-action";
import type { DecodedFrame, ReleaseMaps } from "@/lib/observability/trace-decode";

// "Show the code location" (docs/error-logging-a-grade-plan.md, Phase C): the server hands
// out short-lived private links to that release's source maps, and the owner's browser reads
// the stack trace back to our files, so the site itself never does the heavy work.

type TraceState = { kind: "idle" } | { kind: "shown"; frames: DecodedFrame[] } | { kind: "failed"; message: string };

const DOWNLOAD_FAILED = "The code maps didn't download. Try again in a moment.";

async function fetchGzipJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`);
  const text = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(text);
}

async function fetchDecodedFrames({ reference, detail }: { reference: string; detail: string }): Promise<TraceState> {
  const result = await callQuickAction("problems.show_trace", () => fetchProblemTraceMapsAction({ reference }));
  if (result.status !== "success" || !("urls" in result) || !result.urls) return { kind: "failed", message: result.message };
  const [{ getDecodedFrames }, browser, server] = await Promise.all([import("@/lib/observability/trace-decode"), fetchGzipJson(result.urls.browser), fetchGzipJson(result.urls.server)]);
  const { worker, chunks } = server as Pick<ReleaseMaps, "worker" | "chunks">;
  return { kind: "shown", frames: getDecodedFrames({ detail, maps: { browser: browser as ReleaseMaps["browser"], worker, chunks } }) };
}

function FrameList({ frames }: { frames: DecodedFrame[] }) {
  if (frames.length === 0) return <p className="type-small text-muted">No code locations in this report.</p>;
  return (
    <ol className="type-small grid gap-1 font-mono">
      {frames.map((frame, index) => (
        <li key={`${index}-${frame.location}`} className={frame.isDecoded ? "" : "text-muted"}>
          {frame.name || "(anonymous)"} — {frame.location}
          {!frame.isDecoded && " (not in the maps)"}
        </li>
      ))}
    </ol>
  );
}

export function TraceView({ reference, detail }: { reference: string; detail: string }) {
  const [state, setState] = useState<TraceState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  const handleShow = () =>
    startTransition(async () => {
      const next = await fetchDecodedFrames({ reference, detail }).catch((): TraceState => ({ kind: "failed", message: DOWNLOAD_FAILED }));
      setState(next);
    });

  if (state.kind === "shown") return <FrameList frames={state.frames} />;
  return (
    <div className="grid gap-2">
      <div>
        <button type="button" onClick={handleShow} aria-busy={isPending} className={getButtonClassName({ size: "s", variant: "secondary" })}>
          {isPending ? <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" /> : <Code aria-hidden size={ICON_SIZE.button} />}
          {isPending ? "Reading the code maps…" : "Show the code location"}
        </button>
      </div>
      {state.kind === "failed" && <Message tone="error" title={state.message} />}
    </div>
  );
}
