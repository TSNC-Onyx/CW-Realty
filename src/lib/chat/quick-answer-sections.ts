import { QUICK_ANSWER_PREFIX, getHeadingLines, isSameTitle, type HeadingLine } from "@/lib/chat/policy-sections";

// Writing the chat topic buttons' answers into the policy text (docs/cwr-chat-quick-answers-and-tests-plan.md §B).
// Each answer is a "# Quick answer: <label>" section running to the next heading: an existing one
// gets its text replaced, a missing one is added at the end, and an emptied one is removed. The
// rest of the policy is left exactly as it was, line endings included. Browser-safe (no imports
// beyond the section helpers). Headings are found the same way the assistant reads them: never
// inside code fences, and a heading inside a private section is never touched.

export type QuickAnswerText = { label: string; text: string };

type QuickSection = { start: number; end: number };

/** One line of plain text: an answer can never add a line break or a heading of its own. */
export function getSingleLineAnswer(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The public section's lines (heading through the line before the next heading), or null when it's missing. */
function getQuickSection({ headings, lineCount, label }: { headings: HeadingLine[]; lineCount: number; label: string }): QuickSection | null {
  const wanted = `${QUICK_ANSWER_PREFIX}${label}`;
  const position = headings.findIndex((heading) => !heading.isPrivate && isSameTitle({ first: heading.title, second: wanted }));
  const heading = headings[position];
  if (!heading) return null;
  return { start: heading.index, end: headings[position + 1]?.index ?? lineCount };
}

/** The new lines for one answer: heading, text, and a blank line before the next section. */
function getSectionLines({ label, text }: QuickAnswerText): string[] {
  return [`# ${QUICK_ANSWER_PREFIX}${label}`, getSingleLineAnswer(text), ""];
}

function getLinesWithAnswer({ lines, answer }: { lines: string[]; answer: QuickAnswerText }): string[] {
  const section = getQuickSection({ headings: getHeadingLines(lines.join("\n")), lineCount: lines.length, label: answer.label });
  const isEmpty = getSingleLineAnswer(answer.text).length === 0;
  if (section) return [...lines.slice(0, section.start), ...(isEmpty ? [] : getSectionLines(answer)), ...lines.slice(section.end)];
  if (isEmpty) return lines;
  const isLastLineBlank = (lines.at(-1) ?? "").trim().length === 0;
  return [...lines, ...(isLastLineBlank ? [] : [""]), ...getSectionLines(answer)];
}

/** The policy text with every given answer written in (or removed when emptied). */
export function getPolicyWithQuickAnswers({ policyBody, answers }: { policyBody: string; answers: QuickAnswerText[] }): string {
  const lineEnding = policyBody.includes("\r\n") ? "\r\n" : "\n";
  const lines = policyBody.split(/\r?\n/);
  const updatedLines = answers.reduce((current, answer) => getLinesWithAnswer({ lines: current, answer }), lines);
  return updatedLines.join(lineEnding).replace(/(\r?\n)+$/, "");
}
