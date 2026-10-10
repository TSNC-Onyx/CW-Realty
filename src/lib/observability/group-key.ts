import type { ProblemEvent } from "@/lib/observability/problem-types";
import { getScrubbedDetail } from "@/lib/observability/scrub";

// Crashes and browser errors are grouped by what went wrong, not only by where and what kind
// (docs/error-logging-a-grade-plan.md, Phase D): the first line of the error message, with
// the parts that change from one occurrence to the next removed. Stack lines are left out:
// built code's names change with every release, which would split one bug into many groups.
// The database adds the key to the group fingerprint (cwr.get_normalized_problem). The cleaned
// line is scrubbed like the detail itself, so the key carries nothing the detail doesn't.
// No Node-only modules: the middleware records problems too.

const GROUPED_STAGES = new Set(["unexpected", "browser"]);
const MAX_KEY_LENGTH = 200;
const VARYING_PARTS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /https?:\/\/\S+/g, replacement: "<url>" },
  { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replacement: "<id>" },
  { pattern: /"[^"]*"|'[^']*'|`[^`]*`|“[^”]*”/g, replacement: "<text>" },
  { pattern: /\b[0-9a-f]*\d[0-9a-f]*\b/gi, replacement: "<n>" },
  { pattern: /\s+/g, replacement: " " },
];
const FRAME_PATTERN = /:\d+:\d+\)?\s*$/;

function getFirstMessageLine(detail: string): string | null {
  const line = detail.split("\n").find((candidate) => candidate.trim() !== "" && !FRAME_PATTERN.test(candidate));
  return line?.trim() ?? null;
}

/** What went wrong, cleaned and scrubbed; null when the problem keeps the usual grouping (by action, stage and code). */
export function getGroupKey(event: Pick<ProblemEvent, "stage" | "detail">): string | null {
  if (!GROUPED_STAGES.has(event.stage) || !event.detail) return null;
  const line = getFirstMessageLine(event.detail);
  if (!line) return null;
  const normalized = VARYING_PARTS.reduce((current, { pattern, replacement }) => current.replace(pattern, replacement), line).trim();
  return getScrubbedDetail(normalized, MAX_KEY_LENGTH);
}
