import { describe, expect, it } from "vitest";

import { getCappedSeverity, getVisitorBrowserCode, getVisitorDigest, getVisitorStackFrames, isBrowserReportable, isSameSiteOrigin, isVisitorBrowserAction } from "@/lib/observability/problem-report-rules";

describe("browser problem report rules", () => {
  it.each([
    ["an upload the browser saw fail", "homework.upload_file", true],
    ["a form call that dropped", "trash.delete_forever", true],
    ["a page crash", "portal.page_crash", true],
    ["a background job", "jobs.photo_cleanup", false],
    ["a database check", "database.scheduled_job", false],
    ["a page load the server checks", "homework.load", false],
    ["a sign-in session check", "auth.session_check", false],
    ["a visitor's Quick Check that didn't load", "site.bot_check_widget", true],
    ["a visitor's broken listing photo", "site.listing_photo", true],
    ["a Quick Check refusal the server decides", "site.bot_check", false],
    ["a chat reply the server fetches", "site.chat_assistant", false],
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

  it.each([
    ["the chat window", "site.chat_widget", true],
    ["the contact form", "site.contact_form", true],
    ["a server-side chat message", "site.chat_message", false],
    ["an admin upload", "homework.upload_file", false],
  ] as const)("treat %s as a visitor report or not", (_label, action, expected) => {
    // Act
    const isVisitorReport = isVisitorBrowserAction(action);

    // Assert
    expect(isVisitorReport).toBe(expected);
  });

  it("keeps a code from the visitor list", () => {
    // Act
    const code = getVisitorBrowserCode("image_failed");

    // Assert
    expect(code).toBe("image_failed");
  });

  it("turns a code outside the visitor list into other", () => {
    // Act
    const code = getVisitorBrowserCode("file_rejected");

    // Assert
    expect(code).toBe("other");
  });
});

describe("what a website visitor's report may carry", () => {
  it("keeps only code locations from our own built code, without query strings", () => {
    // Arrange
    const detail = [
      "TypeError: Nothing found for jo@example.com",
      "    at a (https://www.example.com/_next/static/chunks/0f3a.js?v=1:1:200)",
      "b@https://www.example.com/_next/static/chunks/9c1d.js:3:44",
      "    at c (chrome-extension://abc/x.js:1:1)",
      "my phone is 555 123 4567",
    ].join("\n");

    // Act
    const frames = getVisitorStackFrames(detail);

    // Assert
    expect(frames).toBe("TypeError\nat a (https://www.example.com/_next/static/chunks/0f3a.js:1:200)\nb@https://www.example.com/_next/static/chunks/9c1d.js:3:44");
  });

  it("keeps nothing when there are no code locations", () => {
    // Act
    const frames = getVisitorStackFrames("Something the visitor typed");

    // Assert
    expect(frames).toBeUndefined();
  });

  it("keeps a digest only for a page crash, where it links to the server's record", () => {
    // Act
    const digests = [getVisitorDigest({ action: "site.page_crash", digest: "123" }), getVisitorDigest({ action: "site.contact_form", digest: "123" })];

    // Assert
    expect(digests).toEqual(["123", undefined]);
  });

  it("lets a visitor's browser report a page crash and an uncaught error", () => {
    // Act
    const answers = [isVisitorBrowserAction("site.page_crash"), isVisitorBrowserAction("site.browser_error")];

    // Assert
    expect(answers).toEqual([true, true]);
  });

  it("keeps the error's kind but not its message when there are no code locations", () => {
    // Act
    const frames = getVisitorStackFrames("TypeError: Nothing found for jo@example.com");

    // Assert
    expect(frames).toBe("TypeError");
  });
});
