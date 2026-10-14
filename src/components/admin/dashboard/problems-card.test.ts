import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProblemsCard } from "@/components/admin/dashboard/problems-card";
import { getLoaded } from "@/lib/admin/load-result";

function getCardText({ total, serious }: { total: number; serious: number }): string {
  return renderToStaticMarkup(createElement(ProblemsCard, { counts: getLoaded({ total, serious, visitors: 0, groups: 3 }) }));
}

describe("the dashboard's problems card", () => {
  it.each([
    ["no problems", { total: 0, serious: 0 }, "Nothing went wrong."],
    ["only notes and warnings, without guessing what they were", { total: 13, serious: 0 }, "None were errors.</p>"],
    ["one error", { total: 13, serious: 1 }, "1 was an error or worse."],
    ["several errors", { total: 13, serious: 4 }, "4 were errors or worse."],
  ])("describes %s", (_label, counts, expected) => {
    // Act
    const text = getCardText(counts);

    // Assert
    expect(text).toContain(expected);
  });

  it("says how many distinct problems there were and links to the Problems page", () => {
    // Act
    const text = getCardText({ total: 13, serious: 0 });

    // Assert
    expect({ hasGroups: text.includes("3 distinct problems in all."), hasLink: text.includes('href="/admin/problems"') }).toEqual({ hasGroups: true, hasLink: true });
  });
});

