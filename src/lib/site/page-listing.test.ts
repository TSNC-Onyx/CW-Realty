import { beforeEach, describe, expect, it, vi } from "vitest";

import { reportLoadFailure } from "@/lib/observability/report-load-failure";
import { fetchPageListing } from "@/lib/site/page-listing";
import { getPublicClient, type PublicClient } from "@/lib/supabase/public-client";

// When the database fails, every page stays listed and the failure is recorded
// (docs/visitor-audit-fixes-plan.md R4).

vi.mock("@/lib/observability/report-load-failure", () => ({ reportLoadFailure: vi.fn() }));
vi.mock("@/lib/supabase/public-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/public-client")>()),
  getPublicClient: vi.fn(),
}));

/** A stand-in for the Supabase client whose every query answers with a database error. */
function getFailingClient(): PublicClient {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: { message: "database down" } }) };
  return { from: () => query } as unknown as PublicClient;
}

describe("fetchPageListing", () => {
  beforeEach(() => {
    vi.mocked(reportLoadFailure).mockReset();
    vi.mocked(getPublicClient).mockReturnValue(getFailingClient());
  });

  it("keeps every page listed and records the failure once when the database fails", async () => {
    // Act
    const listing = await fetchPageListing();

    // Assert
    expect(listing).toEqual({ isConnectionsPageVisible: true });
    expect(reportLoadFailure).toHaveBeenCalledTimes(1);
    expect(reportLoadFailure).toHaveBeenCalledWith("page_listing", expect.any(Error), null);
  });
});
