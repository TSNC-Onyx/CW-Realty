import { TraceMap, originalPositionFor, type SourceMapInput } from "@jridgewell/trace-mapping";

// Reads a stored stack trace back to our source files (docs/error-logging-a-grade-plan.md,
// Phase C), with the source maps kept privately for that release (scripts/store-source-maps.mjs).
// Browser frames need one map: the chunk's own. Server frames need two: the deployed Worker
// bundle's map leads to a server chunk, and that chunk's map leads to the source file.
// No "@/" imports: scripts/trace-problem.mts runs this file directly in Node.

const FRAME_PATTERN = /^(.*?)((?:[a-z][\w+.-]*:\/\/)?[^\s()]+):(\d+):(\d+)\)?\s*$/;
const BROWSER_MARKER = "/_next/static/";
const SERVER_CHUNK_MARKER = "server-functions/default/";
const SOURCE_PREFIX_PATTERN = /^(?:\.\.\/)+|^(?:webpack|turbopack):\/\/\/?(?:\[project\]\/)?|^\[project\]\//;

export type ReleaseMaps = {
  /** Keyed by the chunk's address from "/_next/static/…". */
  browser: Record<string, SourceMapInput>;
  /** The deployed Worker bundle. */
  worker: SourceMapInput | null;
  /** Keyed by ".next/server/…" chunk path. */
  chunks: Record<string, SourceMapInput>;
};

/** location: "src/…/file.ts:line", or the original text when no map covers the frame. */
export type DecodedFrame = { name: string; location: string; isDecoded: boolean };

type ParsedFrame = { name: string; file: string; line: number; column: number };

type Position = { source: string; line: number; column: number; name: string | null };

const traceMaps = new WeakMap<object, TraceMap>();

function getTraceMap(map: SourceMapInput): TraceMap {
  if (typeof map !== "object") return new TraceMap(map);
  const cached = traceMaps.get(map);
  if (cached) return cached;
  const created = new TraceMap(map);
  traceMaps.set(map, created);
  return created;
}

function getParsedFrame(line: string): ParsedFrame | null {
  const match = FRAME_PATTERN.exec(line.trim());
  if (!match) return null;
  const [, prefix = "", file = "", lineText = "0", columnText = "0"] = match;
  const name = prefix.replace(/^at\s+/, "").replace(/[\s(@]+$/, "").trim();
  return { name, file, line: Number(lineText), column: Math.max(0, Number(columnText) - 1) };
}

function getPosition({ map, line, column }: { map: SourceMapInput | undefined | null; line: number; column: number }): Position | null {
  if (!map) return null;
  const position = originalPositionFor(getTraceMap(map), { line, column });
  if (!position.source || position.line === null) return null;
  return { source: position.source, line: position.line, column: position.column ?? 0, name: position.name };
}

function getBrowserPosition({ frame, maps }: { frame: ParsedFrame; maps: ReleaseMaps }): Position | null {
  const key = frame.file.slice(frame.file.indexOf(BROWSER_MARKER));
  return getPosition({ map: maps.browser[key], line: frame.line, column: frame.column });
}

function getServerPosition({ frame, maps }: { frame: ParsedFrame; maps: ReleaseMaps }): Position | null {
  const inBundle = getPosition({ map: maps.worker, line: frame.line, column: frame.column });
  if (!inBundle || !inBundle.source.includes(SERVER_CHUNK_MARKER)) return inBundle;
  const chunkKey = decodeURIComponent(inBundle.source.slice(inBundle.source.indexOf(SERVER_CHUNK_MARKER) + SERVER_CHUNK_MARKER.length));
  return getPosition({ map: maps.chunks[chunkKey], line: inBundle.line, column: inBundle.column });
}

function getCleanSource(source: string): string {
  return decodeURIComponent(source).replace(SOURCE_PREFIX_PATTERN, "").replace(SOURCE_PREFIX_PATTERN, "");
}

function getDecodedFrame({ line, maps }: { line: string; maps: ReleaseMaps }): DecodedFrame {
  const frame = getParsedFrame(line);
  if (!frame) return { name: "", location: line.trim(), isDecoded: false };
  const position = frame.file.includes(BROWSER_MARKER) ? getBrowserPosition({ frame, maps }) : getServerPosition({ frame, maps });
  if (!position) return { name: frame.name, location: `${frame.file}:${frame.line}:${frame.column + 1}`, isDecoded: false };
  return { name: position.name ?? frame.name, location: `${getCleanSource(position.source)}:${position.line}`, isDecoded: true };
}

/** Each stack line of a problem's detail, read back to a source file and line where a map covers it. */
export function getDecodedFrames({ detail, maps }: { detail: string; maps: ReleaseMaps }): DecodedFrame[] {
  return detail
    .split("\n")
    .filter((line) => FRAME_PATTERN.test(line.trim()))
    .map((line) => getDecodedFrame({ line, maps }));
}
