import { beforeEach, describe, expect, it, vi } from "vitest";

import { reportLoadFailure } from "@/lib/observability/report-load-failure";
import { TRACKING_OFF, fetchTrackingSettings } from "@/lib/tracking/tracking-settings";
import { getPublicClient, type PublicClient } from "@/lib/supabase/public-client";

// When the database fails, nothing tracks and the failure is recorded
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

describe("fetchTrackingSettings", () => {
  beforeEach(() => {
    vi.mocked(reportLoadFailure).mockReset();
    vi.mocked(getPublicClient).mockReturnValue(getFailingClient());
  });

  it("turns tracking off and records the failure once when the database fails", async () => {
    // Act
    const settings = await fetchTrackingSettings();

    // Assert
    expect(settings).toEqual(TRACKING_OFF);
    expect(reportLoadFailure).toHaveBeenCalledTimes(1);
    expect(reportLoadFailure).toHaveBeenCalledWith("tracking_settings", expect.any(Error), null);
  });
});
