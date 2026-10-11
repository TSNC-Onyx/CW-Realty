import { describe, expect, it, vi } from "vitest";

import { showPageNotFound } from "@/lib/admin/record-page-not-found";
import type { AdminContext } from "@/lib/admin/require-admin";

const { reportProblem, notFound } = vi.hoisted(() => ({
  reportProblem: vi.fn(async () => ({ reference: "CWR-NFD-001", stored: "unknown", isSuppressed: false })),
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));

vi.mock("@/lib/observability/report-problem", () => ({ reportProblem }));
vi.mock("next/navigation", () => ({ notFound }));

const ADMIN = { tenantId: "t", userId: "u", role: "manager" } as AdminContext;

describe("an admin page whose item isn't there", () => {
  it("records the address that was opened, then shows the not-found screen", async () => {
    // Act
    const shown = showPageNotFound({ admin: ADMIN, path: "/admin/listings/abc" });

    // Assert
    await expect(shown).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(reportProblem).toHaveBeenCalledWith(expect.objectContaining({ action: "portal.page_not_found", severity: "info", pagePath: "/admin/listings/abc", actorId: "u" }));
  });
});
