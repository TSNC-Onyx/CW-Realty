import type { JobDatabase, JobProblem } from "./jobs.ts";

// The email-worker's problem recorder: a log line, then cwr.record_problem — the same problem
// log the site writes to. Job problems carry only fixed wording (never anything a person
// typed), so no scrubbing is needed. Never throws. getReference matches the site's
// (src/lib/observability/reference.ts; problems.test.ts fails if they drift).

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 6;
const GROUP_LENGTH = 3;
const BITS_PER_CHARACTER = 5n;
const CHARACTER_MASK = 31n;
const ID_HEX_DIGITS = 8;

export function getReference(problemId: string): string {
  let value = BigInt(`0x${problemId.replace(/-/g, "").slice(0, ID_HEX_DIGITS)}`);
  const characters: string[] = [];
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    characters.unshift(ALPHABET.charAt(Number(value & CHARACTER_MASK)));
    value >>= BITS_PER_CHARACTER;
  }
  return `CWR-${characters.slice(0, GROUP_LENGTH).join("")}-${characters.slice(GROUP_LENGTH).join("")}`;
}

function getPayload(problem: JobProblem, id: string): Record<string, unknown> {
  return {
    id,
    reference: getReference(id),
    tenant_id: problem.tenantId ?? null,
    origin: problem.origin,
    action: problem.action,
    stage: problem.stage,
    severity: problem.severity,
    code: problem.code,
    detail: problem.detail,
  };
}

export function getProblemRecorder(db: JobDatabase): (problem: JobProblem) => Promise<void> {
  return async (problem) => {
    const payload = getPayload(problem, crypto.randomUUID());
    console.error(JSON.stringify({ level: problem.severity, message: "problem", ...payload }));
    const { error } = await db.rpc("record_problem", { p: payload });
    if (error) console.error(JSON.stringify({ level: "error", message: "problem_log_write_failed", code: error.code ?? null }));
  };
}
