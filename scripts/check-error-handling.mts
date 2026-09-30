// Error-handling check, run in CI (docs/cwr-error-tracking-plan.md, Enforcement).
// Fails when admin, job, or observability code ignores the error of a Supabase call — the
// silent failures that let problems go unrecorded — or when an admin server action is
// missing from the problem catalog. Uses the TypeScript checker, so it follows types, not
// text, and multi-line query chains are covered.
//
// Usage: node scripts/check-error-handling.mts
//
// A result is "checked" when its `error` is read, or when the whole result is handed on (to a
// function, a return, or another variable). A deliberate ignore needs `// error-ok: <reason>`
// on the same line.

import path from "node:path";

import ts from "typescript";

import { PROBLEM_ACTIONS } from "../src/lib/observability/problem-catalog.ts";

const CHECKED_DIRECTORIES = ["src/lib/admin", "app/admin", "src/lib/jobs", "src/lib/observability"];
const CHECKED_FILES = ["worker.ts", "middleware.ts"];
const SERVER_ACTION_DIRECTORY = "src/lib/admin";
const SUPABASE_ERROR_TYPES = /PostgrestError|AuthError|StorageError|FunctionsError/;
const EXEMPTION_MARKER = "// error-ok:";
const DATA_ONLY_PROPERTIES = new Set(["data", "count"]);

type Finding = { file: string; line: number; message: string };

function getProgram(): ts.Program {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("tsconfig.json not found");
  const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined });
  if (!config) throw new Error("tsconfig.json could not be read");
  return ts.createProgram({ rootNames: config.fileNames, options: config.options });
}

function isCheckedFile(fileName: string): boolean {
  const relative = path.relative(process.cwd(), fileName);
  if (relative.endsWith(".test.ts") || relative.endsWith(".d.ts")) return false;
  return CHECKED_FILES.includes(relative) || CHECKED_DIRECTORIES.some((directory) => relative.startsWith(`${directory}/`));
}

function hasSupabaseError(checker: ts.TypeChecker, type: ts.Type): boolean {
  const errorProperty = type.getProperty("error");
  if (!errorProperty?.valueDeclaration && !errorProperty?.declarations?.length) return false;
  const declaration = errorProperty.valueDeclaration ?? errorProperty.declarations?.[0];
  if (!declaration) return false;
  return SUPABASE_ERROR_TYPES.test(checker.typeToString(checker.getTypeOfSymbolAtLocation(errorProperty, declaration)));
}

function isExempt(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  const lineText = sourceFile.text.split("\n")[line] ?? "";
  return lineText.includes(EXEMPTION_MARKER);
}

function getEnclosingFunction(node: ts.Node): ts.Node {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isFunctionLike(current) && !ts.isSourceFile(current)) current = current.parent;
  return current ?? node.getSourceFile();
}

function getReferences(checker: ts.TypeChecker, name: ts.Identifier): ts.Identifier[] {
  const symbol = checker.getSymbolAtLocation(name);
  const references: ts.Identifier[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node !== name && checker.getSymbolAtLocation(node) === symbol) references.push(node);
    ts.forEachChild(node, visit);
  };
  visit(getEnclosingFunction(name));
  return references;
}

function isDataOnlyUse(reference: ts.Identifier): boolean {
  const parent = reference.parent;
  return ts.isPropertyAccessExpression(parent) && parent.expression === reference && DATA_ONLY_PROPERTIES.has(parent.name.text);
}

function getBindingProblem(checker: ts.TypeChecker, binding: ts.BindingName): string | null {
  if (ts.isIdentifier(binding)) {
    const references = getReferences(checker, binding);
    return references.length > 0 && references.every(isDataOnlyUse) ? "only its data is used; read its error" : null;
  }
  if (!ts.isObjectBindingPattern(binding)) return null;
  const errorElement = binding.elements.find((element) => (element.propertyName ?? element.name).getText() === "error");
  if (!errorElement) return "is destructured without its error";
  if (!ts.isIdentifier(errorElement.name)) return null;
  return getReferences(checker, errorElement.name).length === 0 ? "has an error that is never read" : null;
}

function getAwaitProblem(checker: ts.TypeChecker, node: ts.AwaitExpression): string | null {
  const parent = node.parent;
  if (ts.isExpressionStatement(parent)) return "is awaited and its result discarded";
  if (ts.isVariableDeclaration(parent)) return getBindingProblem(checker, parent.name);
  return null;
}

function getTupleProblems(checker: ts.TypeChecker, node: ts.VariableDeclaration): string[] {
  if (!ts.isArrayBindingPattern(node.name) || !node.initializer || !ts.isAwaitExpression(node.initializer)) return [];
  return node.name.elements.flatMap((element, index) => {
    if (ts.isOmittedExpression(element) || !hasSupabaseError(checker, checker.getTypeAtLocation(element))) return [];
    const problem = getBindingProblem(checker, element.name);
    return problem ? [`result #${index + 1} of Promise.all ${problem}`] : [];
  });
}

function getFileFindings(checker: ts.TypeChecker, sourceFile: ts.SourceFile): Finding[] {
  const findings: Finding[] = [];
  const add = (node: ts.Node, message: string) => {
    if (isExempt(sourceFile, node)) return;
    findings.push({ file: path.relative(process.cwd(), sourceFile.fileName), line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1, message });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isAwaitExpression(node) && hasSupabaseError(checker, checker.getTypeAtLocation(node))) {
      const problem = getAwaitProblem(checker, node);
      if (problem) add(node, `A Supabase result ${problem}.`);
    }
    if (ts.isVariableDeclaration(node)) getTupleProblems(checker, node).forEach((problem) => add(node, `A Supabase ${problem}.`));
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function isServerActionFile(sourceFile: ts.SourceFile): boolean {
  const first = sourceFile.statements[0];
  return first !== undefined && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use server";
}

function getExportedAsyncFunctions(sourceFile: ts.SourceFile): string[] {
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) return [];
    const modifiers = ts.getModifiers(statement) ?? [];
    const isExported = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    const isAsync = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);
    return isExported && isAsync ? [statement.name.text] : [];
  });
}

function getCatalogFindings(program: ts.Program): Finding[] {
  const catalogFunctions = new Set<string>(Object.values(PROBLEM_ACTIONS).flatMap((definition) => ("fn" in definition ? [definition.fn] : [])));
  const actionFiles = program.getSourceFiles().filter((file) => path.relative(process.cwd(), file.fileName).startsWith(`${SERVER_ACTION_DIRECTORY}/`) && isServerActionFile(file));
  const exported = actionFiles.flatMap((file) => getExportedAsyncFunctions(file).map((name) => ({ name, file: path.relative(process.cwd(), file.fileName) })));
  const exportedNames = new Set(exported.map(({ name }) => name));
  const missing = exported.filter(({ name }) => !catalogFunctions.has(name)).map(({ name, file }) => ({ file, line: 1, message: `Server action ${name} is not in the problem catalog.` }));
  const stale = [...catalogFunctions].filter((name) => !exportedNames.has(name)).map((name) => ({ file: "src/lib/observability/problem-catalog.ts", line: 1, message: `Catalog names ${name}, which no longer exists.` }));
  return [...missing, ...stale];
}

function getAllFindings(): Finding[] {
  const program = getProgram();
  const checker = program.getTypeChecker();
  const resultFindings = program.getSourceFiles().filter((file) => isCheckedFile(file.fileName)).flatMap((file) => getFileFindings(checker, file));
  return [...resultFindings, ...getCatalogFindings(program)];
}

const findings = getAllFindings();
if (findings.length > 0) {
  console.error(`Error-handling check failed:\n${findings.map(({ file, line, message }) => `  - ${file}:${line} ${message}`).join("\n")}`);
  process.exit(1);
}
console.log("Error-handling check passed.");
