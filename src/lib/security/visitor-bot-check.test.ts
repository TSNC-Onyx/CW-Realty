import { beforeEach, describe, expect, it, vi } from "vitest";

import * as reporting from "@/lib/observability/report-visitor-problem";
import * as turnstile from "@/lib/security/turnstile";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/observability/report-visitor-problem", () => ({ reportVisitorProblem: vi.fn() }));
vi.mock("@/lib/security/turnstile", () => ({ checkTurnstileToken: vi.fn() }));

const CHECK = { token: "token", remoteIp: null, expectedAction: "contact-form", expectedHostname: "www.charliewardrealty.com" };

// Fresh module per test: setup problems are recorded once per running copy.
async function loadCheck() {
  vi.resetModules();
  return (await import("@/lib/security/visitor-bot-check")).passesVisitorBotCheck;
}

describe("passesVisitorBotCheck", () => {
  beforeEach(() => {
    vi.mocked(reporting.reportVisitorProblem).mockReset();
  });

  it("records nothing when the visitor passes", async () => {
    // Arrange
    vi.mocked(turnstile.checkTurnstileToken).mockResolvedValue({ isPassed: true, reason: "passed", errorCodes: [] });
    const passesVisitorBotCheck = await loadCheck();

    // Act
    await passesVisitorBotCheck(CHECK);

    // Assert
    expect(reporting.reportVisitorProblem).not.toHaveBeenCalled();
  });

  it.each([
    ["an ordinary bot refusal", "rejected", "info"],
    ["Cloudflare not answering", "unreachable", "warning"],
    ["a missing secret that blocks every visitor", "not_configured", "critical"],
    ["test keys in production", "test_key_in_production", "critical"],
  ] as const)("records %s at the right level", async (_label, reason, severity) => {
    // Arrange
    vi.mocked(turnstile.checkTurnstileToken).mockResolvedValue({ isPassed: false, reason, errorCodes: [] });
    const passesVisitorBotCheck = await loadCheck();

    // Act
    await passesVisitorBotCheck(CHECK);

    // Assert
    expect(reporting.reportVisitorProblem).toHaveBeenCalledWith(expect.objectContaining({ action: "site.bot_check", code: reason, severity }));
  });

  it("records a setup problem once, not for every visitor it blocks", async () => {
    // Arrange
    vi.mocked(turnstile.checkTurnstileToken).mockResolvedValue({ isPassed: false, reason: "not_configured", errorCodes: [] });
    const passesVisitorBotCheck = await loadCheck();

    // Act
    await passesVisitorBotCheck(CHECK);
    await passesVisitorBotCheck(CHECK);

    // Assert
    expect(reporting.reportVisitorProblem).toHaveBeenCalledTimes(1);
  });

  it("keeps Cloudflare's reason with the form it came from", async () => {
    // Arrange
    vi.mocked(turnstile.checkTurnstileToken).mockResolvedValue({ isPassed: false, reason: "rejected", errorCodes: ["invalid-input-response"] });
    const passesVisitorBotCheck = await loadCheck();

    // Act
    await passesVisitorBotCheck(CHECK);

    // Assert
    expect(reporting.reportVisitorProblem).toHaveBeenCalledWith(expect.objectContaining({ detail: "contact-form: invalid-input-response" }));
  });
});
