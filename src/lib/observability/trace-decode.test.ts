import { describe, expect, it } from "vitest";

import { getDecodedFrames, type ReleaseMaps } from "@/lib/observability/trace-decode";

// Hand-written maps: "AACA" maps line 1, column 0 to the source's line 2; ";;AAUA" maps line 3,
// column 0 to the source's line 11.
const BROWSER_MAP = { version: 3 as const, sources: ["turbopack:///[project]/src/components/admin/listings/listing-form.tsx"], names: [], mappings: "AACA" };
const WORKER_MAP = { version: 3 as const, sources: ["../../.open-next/server-functions/default/.next/server/chunks/ssr/%5Broot%5D__0td._.js"], names: [], mappings: "AAEA" };
const CHUNK_MAP = { version: 3 as const, sources: ["../../../../src/lib/admin/listings/queries.ts"], names: [], mappings: ";;AAUA" };

const MAPS: ReleaseMaps = {
  browser: { "/_next/static/chunks/0f3a.js": BROWSER_MAP },
  worker: WORKER_MAP,
  chunks: { ".next/server/chunks/ssr/[root]__0td._.js": CHUNK_MAP },
};

describe("reading a stack trace back to our files", () => {
  it("reads a browser frame with that chunk's map", () => {
    // Act
    const [frame] = getDecodedFrames({ detail: "TypeError: x\nat a (https://www.example.com/_next/static/chunks/0f3a.js:1:1)", maps: MAPS });

    // Assert
    expect(frame).toEqual({ name: "a", location: "src/components/admin/listings/listing-form.tsx:2", isDecoded: true });
  });

  it("reads a server frame through the Worker bundle and the server chunk", () => {
    // Act
    const [frame] = getDecodedFrames({ detail: "at g (worker.js:1:1)", maps: MAPS });

    // Assert
    expect(frame).toEqual({ name: "g", location: "src/lib/admin/listings/queries.ts:11", isDecoded: true });
  });

  it("keeps a frame it has no map for as it was", () => {
    // Act
    const [frame] = getDecodedFrames({ detail: "at b (https://www.example.com/_next/static/chunks/unknown.js:4:9)", maps: MAPS });

    // Assert
    expect(frame).toEqual({ name: "b", location: "https://www.example.com/_next/static/chunks/unknown.js:4:9", isDecoded: false });
  });

  it("skips the message lines", () => {
    // Act
    const frames = getDecodedFrames({ detail: "TypeError: Cannot read properties\nat g (worker.js:1:1)", maps: MAPS });

    // Assert
    expect(frames).toHaveLength(1);
  });
});
