import { beforeEach, describe, expect, it, vi } from "vitest";

import sitemap from "../../../app/sitemap";
import { fetchListingSlugs } from "@/lib/content/listings";
import { reportLoadFailure } from "@/lib/observability/report-load-failure";
import { SITE_URL, getListedPagePaths } from "@/lib/site/navigation";

// When listings or team members cannot be read, the sitemap still lists the fixed pages and
// the failure is recorded (docs/visitor-audit-fixes-plan.md R4).

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("@/lib/observability/report-load-failure", () => ({ reportLoadFailure: vi.fn() }));
vi.mock("@/lib/content/listings", () => ({ fetchListingSlugs: vi.fn() }));
vi.mock("@/lib/content/team", () => ({ fetchTeamMembers: vi.fn(async () => []) }));
vi.mock("@/lib/site/page-listing", () => ({ fetchPageListing: vi.fn(async () => ({ isConnectionsPageVisible: true })) }));

describe("sitemap", () => {
  beforeEach(() => {
    vi.mocked(reportLoadFailure).mockReset();
    vi.mocked(fetchListingSlugs).mockRejectedValue(new Error("database down"));
  });

  it("lists only the fixed pages and records the failure once when records cannot be read", async () => {
    // Act
    const entries = await sitemap();

    // Assert
    expect(entries.map((entry) => entry.url)).toEqual(getListedPagePaths().map((path) => `${SITE_URL}${path === "/" ? "" : path}`));
    expect(reportLoadFailure).toHaveBeenCalledTimes(1);
    expect(reportLoadFailure).toHaveBeenCalledWith("sitemap", expect.any(Error), "/sitemap.xml");
  });
});
