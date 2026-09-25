import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { middleware } from "../../../middleware";
import { fetchRedirectDecision } from "@/lib/redirects/lookup";

vi.mock("@/lib/redirects/lookup", () => ({ fetchRedirectDecision: vi.fn() }));

const LOOKUP_DEADLINE_MS = 1500;

function getRequest(href: string): NextRequest {
  return new NextRequest(new URL(href));
}

describe("middleware redirects", () => {
  beforeEach(() => {
    vi.mocked(fetchRedirectDecision).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("combines normalization and a stored redirect into one 301 that keeps the query", async () => {
    // Arrange
    vi.mocked(fetchRedirectDecision).mockResolvedValue({ targetPath: "/resources", status: 301 });
    const request = getRequest("http://charliewardrealty.com/FAQ/?utm_source=flyer");

    // Act
    const response = await middleware(request);

    // Assert
    expect([response.status, response.headers.get("location")]).toEqual([
      301,
      "https://www.charliewardrealty.com/resources?utm_source=flyer",
    ]);
  });

  it("looks up the normalized path, not the typed one", async () => {
    // Arrange
    vi.mocked(fetchRedirectDecision).mockResolvedValue(null);
    const request = getRequest("https://www.charliewardrealty.com/Copy-Of-Russell-Casey/");

    // Act
    await middleware(request);

    // Assert
    expect(fetchRedirectDecision).toHaveBeenCalledWith("/copy-of-russell-casey");
  });

  it("serves the page when the database lookup fails", async () => {
    // Arrange
    vi.mocked(fetchRedirectDecision).mockRejectedValue(new Error("database down"));
    const request = getRequest("https://www.charliewardrealty.com/faq");

    // Act
    const response = await middleware(request);

    // Assert
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("stops waiting for a slow database after one shared deadline", async () => {
    // Arrange
    vi.useFakeTimers();
    vi.mocked(fetchRedirectDecision).mockReturnValue(new Promise(() => undefined));
    const pendingResponse = middleware(getRequest("https://www.charliewardrealty.com/team/jane-smith"));

    // Act
    await vi.advanceTimersByTimeAsync(LOOKUP_DEADLINE_MS);
    const response = await pendingResponse;

    // Assert
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
