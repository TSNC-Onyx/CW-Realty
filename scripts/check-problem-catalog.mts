// Problem-catalog check, run in CI after the local database starts
// (docs/cwr-error-tracking-plan.md, Enforcement). The catalog in code and the one the
// database holds (seeded by migrations) must list the same actions; otherwise problems from
// the missing actions would be stored as "unknown".
//
// Usage: node scripts/check-problem-catalog.mts   (needs `supabase db start` first)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { PROBLEM_ACTIONS } from "../src/lib/observability/problem-catalog.ts";

const PROJECT_ID_PATTERN = /^project_id\s*=\s*"([^"]+)"/m;

function getDatabaseContainer(): string {
  const projectId = PROJECT_ID_PATTERN.exec(readFileSync("supabase/config.toml", "utf8"))?.[1];
  if (!projectId) throw new Error("supabase/config.toml has no project_id");
  return `supabase_db_${projectId}`;
}

function fetchDatabaseActions(): Set<string> {
  const output = execFileSync("docker", ["exec", getDatabaseContainer(), "psql", "-U", "postgres", "-At", "-c", "select action from cwr.problem_catalog"], { encoding: "utf8" });
  return new Set(output.split("\n").filter(Boolean));
}

const codeActions = new Set(Object.keys(PROBLEM_ACTIONS));
const databaseActions = fetchDatabaseActions();
const missingInDatabase = [...codeActions].filter((action) => !databaseActions.has(action));
const missingInCode = [...databaseActions].filter((action) => !codeActions.has(action));
if (missingInDatabase.length > 0 || missingInCode.length > 0) {
  console.error(
    [
      "Problem-catalog check failed:",
      ...missingInDatabase.map((action) => `  - ${action} is in problem-catalog.ts but not in cwr.problem_catalog (add it in a new migration)`),
      ...missingInCode.map((action) => `  - ${action} is in cwr.problem_catalog but not in problem-catalog.ts`),
    ].join("\n"),
  );
  process.exit(1);
}
console.log(`Problem-catalog check passed (${codeActions.size} actions).`);
