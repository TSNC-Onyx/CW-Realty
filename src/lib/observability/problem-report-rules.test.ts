import { describe, expect, it } from "vitest";

import { getCappedSeverity, isBrowserReportable, isSameSiteOrigin } from "@/lib/observability/problem-report-rules";

describe("browser problem report rules", () => {
  it.each([
    ["an upload the browser saw fail", "homework.upload_file", true],
    ["a form call that dropped", "trash.delete_forever", true],
    ["a page crash", "portal.page_crash", true],
    ["a background job", "jobs.photo_cleanup", false],
    ["a database check", "database.scheduled_job", false],
    ["a page load the server checks", "homework.load", false],
    ["a sign-in session check", "auth.session_check", false],
  ] as const)("decide whether a browser may report %s", (_label, action, expected) => {
    // Act
    const isReportable = isBrowserReportable(action);

    // Assert
    expect(isReportable).toBe(expected);
  });

  it.each([
    ["the same site", "https://cwr.example", "cwr.example", true],
    ["another site", "https://evil.example", "cwr.example", false],
    ["a null origin", "null", "cwr.example", false],
    ["a malformed origin", "::::", "cwr.example", false],
    ["no origin", null, "cwr.example", false],
  ])("check %s without ever throwing", (_label, origin, host, expected) => {
    // Act
    const isSameSite = isSameSiteOrigin({ origin, host });

    // Assert
    expect(isSameSite).toBe(expected);
  });

  it("caps how serious a browser report can be", () => {
    // Act
    const severity = getCappedSeverity("critical", "warning");

    // Assert
    expect(severity).toBe("warning");
  });
});
