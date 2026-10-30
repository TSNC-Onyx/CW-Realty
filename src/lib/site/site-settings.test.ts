import { beforeEach, describe, expect, it, vi } from "vitest";

import { reportLoadFailure } from "@/lib/observability/report-load-failure";
import { fetchSiteSettings } from "@/lib/site/site-settings";
import { getPublicClient, type PublicClient } from "@/lib/supabase/public-client";

// When the database fails, pages render without contact details and the failure is recorded
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

describe("fetchSiteSettings", () => {
  beforeEach(() => {
    vi.mocked(reportLoadFailure).mockReset();
    vi.mocked(getPublicClient).mockReturnValue(getFailingClient());
  });

  it("returns no settings and records the failure once when the database fails", async () => {
    // Act
    const settings = await fetchSiteSettings();

    // Assert
    expect(settings).toBeNull();
    expect(reportLoadFailure).toHaveBeenCalledTimes(1);
    expect(reportLoadFailure).toHaveBeenCalledWith("site_settings", expect.any(Error), null);
  });
});
