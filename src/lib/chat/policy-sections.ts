// Policy sections (Phase 5 plan, decision 4): every Markdown heading line in the policy is
// a section the assistant may cite, and the only thing a visitor ever sees of the file.

const HEADING_LINE = /^#{1,6}[ \t]+(.+?)[ \t#]*$/gm;
const MAX_SECTION_TITLE_LENGTH = 200;

function getNormalizedTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getPolicySections(policyBody: string): string[] {
  const lines = policyBody.replace(/\r\n?/g, "\n");
  const titles = [...lines.matchAll(HEADING_LINE)].map((match) => (match[1] ?? "").trim().replace(/\s+/g, " "));
  const usableTitles = titles.filter((title) => title.length > 0 && title.length <= MAX_SECTION_TITLE_LENGTH);
  return [...new Set(usableTitles)];
}

/** The policy's own spelling of a cited section, or null when the policy has no such section. */
export function getMatchingSection(sections: string[], citedTitle: string): string | null {
  const wanted = getNormalizedTitle(citedTitle);
  return sections.find((section) => getNormalizedTitle(section) === wanted) ?? null;
}
