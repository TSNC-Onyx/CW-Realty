import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reportLoadFailure } from "@/lib/observability/report-load-failure";
import { reportProblem } from "@/lib/observability/report-problem";

// A part of a page that could not load is recorded as a website-visitor warning, at most once
// per part per hour in each running copy, after the page is sent (docs/visitor-audit-fixes-plan.md R4).

const after = vi.hoisted(() => vi.fn());
const headers = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({ after }));
vi.mock("next/headers", () => ({ headers }));
vi.mock("@/lib/observability/report-problem", () => ({ reportProblem: vi.fn() }));

const REQUEST_HEADERS = new Headers({ "x-request-id": "req-1", referer: "https://elsewhere.example/" });

/** Each test starts in its own hour, so the once-per-hour memory never carries between tests. */
let testHour = Date.UTC(2026, 9, 30, 0);

/** Runs the work Next.js would run after the page is sent. */
async function runScheduledWork(): Promise<void> {
  const work = after.mock.calls.at(-1)?.[0] as (() => Promise<unknown>) | undefined;
  await work?.();
}

class DatabaseDownError extends Error {
  override name = "DatabaseDownError";
}

describe("reportLoadFailure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    testHour += 60 * 60 * 1000;
    vi.setSystemTime(testHour);
    after.mockReset();
    headers.mockReset().mockResolvedValue(REQUEST_HEADERS);
    vi.mocked(reportProblem).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("schedules one warning naming the part and the page, with the request ID but never the referer", async () => {
    // Arrange
    const error = new DatabaseDownError("connection refused");

    // Act
    await reportLoadFailure("about_owner", error, "/about");
    await runScheduledWork();

    // Assert
    expect(reportProblem).toHaveBeenCalledTimes(1);
    expect(reportProblem).toHaveBeenCalledWith({
      action: "site.page_load",
      stage: "load",
      severity: "warning",
      origin: "server_visitor",
      actorId: null,
      actorRole: null,
      code: "DatabaseDownError",
      detail: "about_owner",
      requestId: "req-1",
      pagePath: "/about",
    });
  });

  it("still schedules the report, without a request ID, when there is no request", async () => {
    // Arrange
    headers.mockRejectedValue(new Error("headers() outside a request"));

    // Act
    await reportLoadFailure("sitemap", new DatabaseDownError(), "/sitemap.xml");
    await runScheduledWork();

    // Assert
    expect(vi.mocked(reportProblem).mock.calls[0]?.[0]).toMatchObject({ detail: "sitemap", requestId: null });
  });

  it("returns without waiting for the report to be saved", async () => {
    // Arrange
    vi.mocked(reportProblem).mockReturnValue(new Promise(() => undefined));
    after.mockImplementation((work: () => Promise<unknown>) => void work());

    // Act
    const finished = reportLoadFailure("site_settings", new DatabaseDownError(), null);

    // Assert
    await expect(finished).resolves.toBeUndefined();
  });

  it("reports the same part only once in the same hour", async () => {
    // Arrange
    await reportLoadFailure("connections", new DatabaseDownError(), "/connections");

    // Act
    await reportLoadFailure("connections", new DatabaseDownError(), "/connections");

    // Assert
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("reports the same part again once the hour changes", async () => {
    // Arrange
    await reportLoadFailure("homework", new DatabaseDownError(), "/resources");
    vi.setSystemTime(testHour + 60 * 60 * 1000);

    // Act
    await reportLoadFailure("homework", new DatabaseDownError(), "/resources");

    // Assert
    expect(after).toHaveBeenCalledTimes(2);
  });

  it("does not throw when the report cannot be scheduled", async () => {
    // Arrange
    after.mockImplementation(() => {
      throw new Error("after() outside a request");
    });

    // Act
    const finished = reportLoadFailure("page_listing", new DatabaseDownError(), null);

    // Assert
    await expect(finished).resolves.toBeUndefined();
  });

  it("logs a fixed line with the part and the error's name, never its message", async () => {
    // Arrange
    const error = new DatabaseDownError("visitor typed secret");

    // Act
    await reportLoadFailure("home_team", error, "/");

    // Assert
    expect(console.error).toHaveBeenCalledWith(JSON.stringify({ message: "Part of a page could not load", siteKey: "home_team", error: "DatabaseDownError" }));
  });
});
