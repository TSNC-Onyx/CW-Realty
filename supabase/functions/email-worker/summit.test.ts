import { describe, expect, it } from "vitest";

import { getChosenBySite, getSummitAccountHtml, getSummitSubject } from "./summit.ts";
import { getAuthEmailTemplates } from "./templates.ts";

// 623 Summit shares the sign-in system, so its reset and invite emails sit beside CWR's in the
// same fallback templates (docs/runbooks/summit-shared-database.md).

const SUMMIT_RETURN_ADDRESS = "`https://623summit.pages.dev/admin`";

function getTemplate(type: string) {
  const template = getAuthEmailTemplates().find((candidate) => candidate.type === type);
  if (!template) throw new Error(`no ${type} template`);
  return template;
}

function getBranches(text: string): { summit: string; cwr: string } {
  const start = text.indexOf("}}") + 2;
  const elseAt = text.indexOf("{{ else }}");
  return { summit: text.slice(start, elseAt), cwr: text.slice(elseAt + "{{ else }}".length, text.lastIndexOf("{{ end }}")) };
}

describe("623 Summit sign-in emails", () => {
  it("chooses the 623 version only for the 623 owner page's return address", () => {
    // Act
    const chosen = getChosenBySite({ summit: "A", cwr: "B" });

    // Assert
    expect([chosen.startsWith("{{ if eq .RedirectTo "), chosen.includes(SUMMIT_RETURN_ADDRESS), chosen.endsWith("}}A{{ else }}B{{ end }}")]).toEqual([true, true, true]);
  });

  it.each(["invite", "recovery"] as const)("the 623 %s links through Supabase's verify step, never to the CWR site", (type) => {
    // Act
    const html = getSummitAccountHtml(type);

    // Assert
    expect([html.includes('href="{{ .ConfirmationURL }}"'), html.includes("{{ .SiteURL }}"), html.includes("623 Summit Avenue")]).toEqual([true, false, true]);
  });

  it.each(["invite", "recovery"] as const)("the CWR branch of %s.html carries no 623 wording", (type) => {
    // Act
    const { cwr } = getBranches(getTemplate(type).html);

    // Assert
    expect([cwr.includes("623"), cwr.includes(`/admin/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}`)]).toEqual([false, true]);
  });

  it.each(["invite", "recovery"] as const)("the %s subject keeps the CWR wording for CWR and uses 623's for 623", (type) => {
    // Act
    const { summit, cwr } = getBranches(getTemplate(type).subject);

    // Assert
    expect([summit, cwr.includes("CWR admin")]).toEqual([getSummitSubject(type), true]);
  });

  it("no other email gains a 623 version", () => {
    // Act
    const withSummit = getAuthEmailTemplates().filter(({ html }) => html.includes(".RedirectTo")).map(({ type }) => type);

    // Assert
    expect(withSummit.sort()).toEqual(["invite", "recovery"]);
  });
});
