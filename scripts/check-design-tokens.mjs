// Design token check, run in CI before any merge (Style §11.15).
// Fails when app code uses a raw color, an arbitrary pixel/color value, a rounded
// corner other than the approved circles, or an inline style (blocked by the CSP).
// The only file allowed to hold raw values is the token file, app/globals.css.
//
// Usage: node scripts/check-design-tokens.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SOURCE_DIRS = ["app", "src"];
const TOKEN_FILE = path.join("app", "globals.css");
const SOURCE_FILE = /\.(tsx?|css)$/;
const TEST_FILE = /\.test\.tsx?$/;
const RULES = [
  { pattern: /#[0-9a-f]{3,8}\b(?![-\w])/i, reason: "raw hex color (use a color token)" },
  { pattern: /\b(rgba?|hsla?|oklch)\(/i, reason: "raw color function (use a color token)" },
  {
    pattern: /\b[\w:-]+-\[[^\]]*(\d(px|rem|em)|#|rgb|hsl)[^\]]*\]/,
    reason: "arbitrary size or color value (use a token)",
  },
  { pattern: /\brounded-(?!none\b|full\b)[\w[]/, reason: "rounded corner (only rounded-none or rounded-full circles)" },
  { pattern: /\bstyle=\{/, reason: "inline style (blocked by the Content Security Policy)" },
];

function getSourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);
    if (statSync(entryPath).isDirectory()) return getSourceFiles(entryPath);
    return SOURCE_FILE.test(entry) && !TEST_FILE.test(entry) ? [entryPath] : [];
  });
}

function getLineViolations(filePath, line, lineNumber) {
  return RULES.filter(({ pattern }) => pattern.test(line)).map(
    ({ reason }) => `${filePath}:${lineNumber}: ${reason}`,
  );
}

function getFileViolations(filePath) {
  const lines = readFileSync(filePath, "utf8").split("\n");
  return lines.flatMap((line, index) => getLineViolations(filePath, line, index + 1));
}

function getAllViolations() {
  const filePaths = SOURCE_DIRS.flatMap(getSourceFiles).filter((filePath) => filePath !== TOKEN_FILE);
  return filePaths.flatMap(getFileViolations);
}

const violations = getAllViolations();
if (violations.length > 0) {
  console.error(`Design token check failed:\n${violations.map((violation) => `  - ${violation}`).join("\n")}`);
  process.exit(1);
}
console.log("Design token check passed.");
