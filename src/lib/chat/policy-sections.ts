// Policy sections (Phase 5 plan, decision 4): every Markdown heading line in the policy is
// a section the assistant may cite, and the only thing a visitor ever sees of the file.
//
// Private sections (owner decision 2026-10-02; docs/cwr-chat-policy-test-batches-plan.md,
// Part B): a heading whose title ends in "(private)" starts notes the assistant never
// receives. They run to the next heading of the same or a higher level, or the end of the
// file. Lines inside fenced code blocks are never headings, unless a fence is left open:
// then fences are ignored, so a typo can't hide a "(private)" heading (fail closed).

const HEADING_LINE = /^#{1,6}[ \t]+(.+?)[ \t#]*$/gm;
const SECTION_HEADING = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/;
const FENCE_LINE = /^[ \t]*(`{3,}|~{3,})/;
const PRIVATE_TITLE = /\(\s*private\s*\)$/i;

/** Chat topic button answers (docs/cwr-chat-guided-options-plan.md §3): "Quick answer: <button label>". */
export const QUICK_ANSWER_PREFIX = "Quick answer: ";
const MAX_SECTION_TITLE_LENGTH = 200;

type Heading = { level: number; title: string };

type PolicyLine = { text: string; heading: Heading | null; isPrivate: boolean };

type ParsedPolicy = { lines: PolicyLine[]; isFenceOpenAtEnd: boolean };

function getNormalizedTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function getTidyTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

function getUsableTitles(titles: string[]): string[] {
  return [...new Set(titles.filter((title) => title.length > 0 && title.length <= MAX_SECTION_TITLE_LENGTH))];
}

function getHeading(text: string): Heading | null {
  const match = SECTION_HEADING.exec(text);
  if (!match) return null;
  return { level: (match[1] ?? "").length, title: getTidyTitle(match[2] ?? "") };
}

/** The fence character that opens or closes a code block on this line, or null. */
function getFenceMark(text: string): string | null {
  return FENCE_LINE.exec(text)?.[1]?.charAt(0) ?? null;
}

/** A fence closes only on the character that opened it (``` or ~~~). */
function getNextOpenFence({ openFence, fenceMark }: { openFence: string | null; fenceMark: string | null }): string | null {
  if (fenceMark === null) return openFence;
  if (openFence === null) return fenceMark;
  return openFence === fenceMark ? null : openFence;
}

/** isFenceAware: false reads every heading-like line as a heading, code fences included. */
function getParsedPolicy({ policyBody, isFenceAware }: { policyBody: string; isFenceAware: boolean }): ParsedPolicy {
  const lines: PolicyLine[] = [];
  let openFence: string | null = null;
  let privateLevel: number | null = null;
  for (const text of policyBody.replace(/\r\n?/g, "\n").split("\n")) {
    const fenceMark = isFenceAware ? getFenceMark(text) : null;
    const heading = fenceMark !== null || openFence !== null ? null : getHeading(text);
    openFence = getNextOpenFence({ openFence, fenceMark });
    if (heading && privateLevel !== null && heading.level <= privateLevel) privateLevel = null;
    if (heading && privateLevel === null && PRIVATE_TITLE.test(heading.title)) privateLevel = heading.level;
    lines.push({ text, heading, isPrivate: privateLevel !== null });
  }
  return { lines, isFenceOpenAtEnd: openFence !== null };
}

/** Each line, with its heading and whether it falls in a private section. */
function getPolicyLines(policyBody: string): PolicyLine[] {
  const parsed = getParsedPolicy({ policyBody, isFenceAware: true });
  return parsed.isFenceOpenAtEnd ? getParsedPolicy({ policyBody, isFenceAware: false }).lines : parsed.lines;
}

function getHeadingTitles(lines: PolicyLine[]): string[] {
  return getUsableTitles(lines.flatMap((line) => (line.heading ? [line.heading.title] : [])));
}

/** Every heading, private or not: what save validation checks (at least one section). */
export function getPolicySections(policyBody: string): string[] {
  const lines = policyBody.replace(/\r\n?/g, "\n");
  const titles = [...lines.matchAll(HEADING_LINE)].map((match) => getTidyTitle(match[1] ?? ""));
  return getUsableTitles(titles);
}

/** The headings the assistant may cite: everything outside private sections. */
export function getPublicSections(policyBody: string): string[] {
  return getHeadingTitles(getPolicyLines(policyBody).filter((line) => !line.isPrivate));
}

/** Headings of private sections and their sub-sections that no public heading shares: a test can never cite these. */
export function getPrivateSections(policyBody: string): string[] {
  const lines = getPolicyLines(policyBody);
  const publicTitles = getHeadingTitles(lines.filter((line) => !line.isPrivate));
  return getHeadingTitles(lines.filter((line) => line.isPrivate)).filter((title) => getMatchingSection(publicTitles, title) === null);
}

/** The policy with every private section removed: the only policy text the model receives. */
export function getPublicPolicy(policyBody: string): string {
  return getPolicyLines(policyBody)
    .filter((line) => !line.isPrivate)
    .map((line) => line.text)
    .join("\n");
}

/** The policy's own spelling of a cited section, or null when the policy has no such section. */
export function getMatchingSection(sections: string[], citedTitle: string): string | null {
  const wanted = getNormalizedTitle(citedTitle);
  return sections.find((section) => getNormalizedTitle(section) === wanted) ?? null;
}

/**
 * The text under a public section heading, up to the next heading, or null when the policy
 * has no such public section (chat topic buttons, docs/cwr-chat-guided-options-plan.md §3).
 */
export function getPublicSectionText(policyBody: string, title: string): string | null {
  const wanted = getNormalizedTitle(title);
  const lines = getPolicyLines(policyBody);
  const start = lines.findIndex((line) => !line.isPrivate && line.heading !== null && getNormalizedTitle(line.heading.title) === wanted);
  if (start === -1) return null;
  const end = lines.findIndex((line, index) => index > start && line.heading !== null);
  const body = lines.slice(start + 1, end === -1 ? undefined : end).filter((line) => !line.isPrivate);
  return body.map((line) => line.text.trim()).filter((text) => text.length > 0).join(" ");
}

function isQuickAnswerTitle(title: string): boolean {
  return getNormalizedTitle(title).startsWith(getNormalizedTitle(QUICK_ANSWER_PREFIX));
}

/** Public lines outside quick-answer sections (each runs to the next heading of any level). */
function getAssistantLines(policyBody: string): PolicyLine[] {
  let isInQuickAnswer = false;
  return getPolicyLines(policyBody).filter((line) => {
    if (line.heading) isInQuickAnswer = isQuickAnswerTitle(line.heading.title);
    return !line.isPrivate && !isInQuickAnswer;
  });
}

/**
 * What the AI reads and may cite: the public policy without quick-answer sections. Those
 * repeat other sections for the topic buttons; if the AI cited them, owner tests expecting
 * the original section would start failing (docs/cwr-chat-quick-answers-and-tests-plan.md §B).
 */
export function getAssistantPolicy(policyBody: string): string {
  return getAssistantLines(policyBody)
    .map((line) => line.text)
    .join("\n");
}

export function getAssistantSections(policyBody: string): string[] {
  return getHeadingTitles(getAssistantLines(policyBody));
}

/** A real heading line (outside code fences): its line number, title, and whether it is private. */
export type HeadingLine = { index: number; title: string; isPrivate: boolean };

/** Every real heading, in order; line numbers match the text split on line breaks (\n or \r\n). */
export function getHeadingLines(policyBody: string): HeadingLine[] {
  return getPolicyLines(policyBody).flatMap((line, index) => (line.heading ? [{ index, title: line.heading.title, isPrivate: line.isPrivate }] : []));
}

/** Whether two section titles are the same, ignoring spacing and capital letters. */
export function isSameTitle({ first, second }: { first: string; second: string }): boolean {
  return getNormalizedTitle(first) === getNormalizedTitle(second);
}

