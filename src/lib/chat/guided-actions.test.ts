import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchGuidedMenuAction, recordGuidedStepAction } from "@/lib/chat/guided-actions";
import * as guidedSteps from "@/lib/chat/guided-steps";
import * as reporting from "@/lib/observability/report-visitor-problem";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/chat/guided-steps", () => ({ fetchGuidedMenu: vi.fn(), recordGuidedStep: vi.fn() }));
vi.mock("@/lib/security/visitor", () => ({ fetchVisitor: vi.fn().mockResolvedValue({ ip: "203.0.113.1", hostname: "www.charliewardrealty.com" }) }));
vi.mock("@/lib/observability/report-visitor-problem", () => ({ reportVisitorProblem: vi.fn(), getErrorName: (error: unknown) => (error instanceof Error ? error.name : "unknown") }));

describe("chat topic button actions", () => {
  beforeEach(() => {
    vi.mocked(reporting.reportVisitorProblem).mockReset();
  });

  it("opens the chat without topic buttons when the menu can't load, and records why", async () => {
    // Arrange
    vi.mocked(guidedSteps.fetchGuidedMenu).mockRejectedValue(new TypeError("fetch failed"));

    // Act
    const menu = await fetchGuidedMenuAction();

    // Assert
    expect({ menu, reported: vi.mocked(reporting.reportVisitorProblem).mock.calls[0]?.[0] }).toEqual({ menu: { status: "unavailable" }, reported: expect.objectContaining({ action: "site.chat_widget", code: "TypeError" }) });
  });

  it("keeps the answer on screen when a tap can't be saved, and records why", async () => {
    // Arrange
    vi.mocked(guidedSteps.recordGuidedStep).mockRejectedValue(new TypeError("fetch failed"));

    // Act
    const result = await recordGuidedStepAction({ sessionId: null, nodeId: "buying" });

    // Assert
    expect({ result, reported: vi.mocked(reporting.reportVisitorProblem).mock.calls.length }).toEqual({ result: { status: "skipped" }, reported: 1 });
  });
});
