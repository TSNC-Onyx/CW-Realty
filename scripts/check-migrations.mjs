// Migration safety check, run in CI before any merge (Infra §1, §4).
// Fails when a migration touches the legacy `public` schema or protected Supabase
// schemas, unschedules a cron job it does not own, is misnamed, or edits a
// migration that already exists on the base branch (merged migrations are immutable).
//
// Usage: node scripts/check-migrations.mjs            (rules only)
//        BASE_REF=origin/main node scripts/check-migrations.mjs  (rules + immutability)

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";
const MIGRATION_FILE_NAME = /^\d{14}_[a-z0-9_]+\.sql$/;
const FORBIDDEN_PATTERNS = [
  { pattern: /\bpublic\./i, reason: "references the legacy public schema" },
  {
    pattern: /\b(alter|drop|truncate)\s+(table\s+|schema\s+|function\s+)?(auth|storage|vault|realtime)\./i,
    reason: "alters a protected Supabase schema",
  },
  {
    pattern: /\b(insert\s+into|update|delete\s+from)\s+(auth|storage|vault|realtime)\./i,
    reason: "writes data in a protected Supabase schema",
  },
  { pattern: /\bon\s+(auth|storage|vault|realtime)\./i, reason: "attaches a trigger or policy to a protected schema" },
  { pattern: /cron\.unschedule\(\s*'(?!cwr_)/i, reason: "unschedules a cron job this build does not own" },
];

function getSqlWithoutComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

function getRuleViolations(fileName) {
  const sql = getSqlWithoutComments(readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8"));
  return FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(sql)).map(
    ({ reason }) => `${fileName}: ${reason}`,
  );
}

function getNameViolations(fileNames) {
  return fileNames
    .filter((fileName) => !MIGRATION_FILE_NAME.test(fileName))
    .map((fileName) => `${fileName}: name must look like 20260925000100_short_description.sql`);
}

function getChangedMergedMigrations(baseRef) {
  const diff = execFileSync("git", ["diff", "--name-status", baseRef, "--", MIGRATIONS_DIR], {
    encoding: "utf8",
  });
  return diff
    .split("\n")
    .filter((line) => /^(M|D|R)/.test(line))
    .map((line) => `${line.split("\t").at(-1)}: already merged migrations must not be edited, renamed, or deleted`);
}

function getAllViolations() {
  const fileNames = readdirSync(MIGRATIONS_DIR).filter((fileName) => fileName.endsWith(".sql"));
  const baseRef = process.env.BASE_REF;
  return [
    ...getNameViolations(fileNames),
    ...fileNames.flatMap(getRuleViolations),
    ...(baseRef ? getChangedMergedMigrations(baseRef) : []),
  ];
}

const violations = getAllViolations();
if (violations.length > 0) {
  console.error(`Migration check failed:\n${violations.map((violation) => `  - ${violation}`).join("\n")}`);
  process.exit(1);
}
console.log("Migration check passed.");
