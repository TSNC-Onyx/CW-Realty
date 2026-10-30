import { beforeEach, describe, expect, it, vi } from "vitest";

import { onRequestError } from "../../../instrumentation";
import { reportProblem } from "@/lib/observability/report-problem";

// A server crash on a public page is recorded as a website-visitor problem, without the
// error's message (docs/visitor-audit-fixes-plan.md R3, docs/error-logging-a-grade-plan.md Phase B).

vi.mock("@/lib/observability/report-problem", () => ({ reportProblem: vi.fn() }));

const SECRET_MESSAGE = "secret";
const ROUTER_CONTEXT = { routerKind: "App Router", routePath: "/listings", routeType: "render", renderSource: "react-server-components", revalidateReason: undefined } as const;

function buildRequest(path: string) {
  return { path, method: "GET", headers: { "x-request-id": "req-1" } };
}

describe("onRequestError", () => {
  beforeEach(() => {
    vi.mocked(reportProblem).mockReset();
  });

  it("records a public page crash once as a website-visitor problem without the error's message", async () => {
    // Arrange
    const request = buildRequest("/listings");

    // Act
    await onRequestError(new Error(SECRET_MESSAGE), request, ROUTER_CONTEXT);

    // Assert
    expect(reportProblem).toHaveBeenCalledTimes(1);
    const reported = vi.mocked(reportProblem).mock.calls[0]?.[0];
    expect(reported).toMatchObject({ action: "site.page_crash", origin: "server_visitor" });
    expect(JSON.stringify(reported)).not.toContain(SECRET_MESSAGE);
  });

  it("never reports a crash of the browser report endpoint itself", async () => {
    // Arrange
    const request = buildRequest("/admin/problems/report");

    // Act
    await onRequestError(new Error(SECRET_MESSAGE), request, { ...ROUTER_CONTEXT, routePath: "/admin/problems/report", routeType: "route" });

    // Assert
    expect(reportProblem).not.toHaveBeenCalled();
  });
});
