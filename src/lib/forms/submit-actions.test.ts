import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import * as intake from "@/lib/forms/intake";
import { submitContactForm } from "@/lib/forms/submit-actions";
import * as reporting from "@/lib/observability/report-visitor-problem";
import * as visitorBotCheck from "@/lib/security/visitor-bot-check";
import * as visitorModule from "@/lib/security/visitor";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/forms/intake", () => ({ submitNewRequest: vi.fn() }));
vi.mock("@/lib/observability/report-visitor-problem", () => ({ reportVisitorProblem: vi.fn(), getErrorName: (error: unknown) => (error instanceof Error ? error.name : "unknown") }));
vi.mock("@/lib/security/rate-limit", () => ({ isOverFormLimit: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/security/visitor-bot-check", () => ({ passesVisitorBotCheck: vi.fn() }));
vi.mock("@/lib/security/visitor", () => ({ fetchVisitor: vi.fn() }));
vi.mock("@/lib/tracking/lead-tracking", () => ({
  fetchLeadTracking: vi.fn().mockResolvedValue({ isAdsAllowed: false, attributionRow: null, fbc: null, fbp: null, sourceUrl: null, userAgent: null }),
  getFormConversion: vi.fn().mockResolvedValue({ eventId: "key", userData: null }),
  scheduleMetaLead: vi.fn(),
}));

const VISITOR = { ip: "203.0.113.1", hostname: "www.charliewardrealty.com" };

function getFormData(fields: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values = { fullName: "Jordan Smith", email: "jordan@example.com", phone: "", message: "Can I see 100 Main St?", idempotencyKey: "key", "cf-turnstile-response": "token", ...fields };
  Object.entries(values).forEach(([name, value]) => formData.set(name, value));
  return formData;
}

describe("submitContactForm", () => {
  beforeEach(() => {
    vi.mocked(visitorModule.fetchVisitor).mockResolvedValue(VISITOR);
    vi.mocked(visitorBotCheck.passesVisitorBotCheck).mockReset().mockResolvedValue(true);
    vi.mocked(intake.submitNewRequest).mockReset().mockResolvedValue("thread");
    vi.mocked(reporting.reportVisitorProblem).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends a message that passes every check", async () => {
    // Act
    const state = await submitContactForm(INITIAL_FORM_STATE, getFormData());

    // Assert
    expect(state.status).toBe("sent");
  });

  it("keeps the typed text when the Quick Check refuses it", async () => {
    // Arrange
    vi.mocked(visitorBotCheck.passesVisitorBotCheck).mockResolvedValue(false);

    // Act
    const state = await submitContactForm(INITIAL_FORM_STATE, getFormData());

    // Assert
    expect({ status: state.status, message: state.values.message }).toEqual({ status: "blocked", message: "Can I see 100 Main St?" });
  });

  it("asks an out-of-date page to refresh without spending its Quick Check", async () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAA-current");

    // Act
    const state = await submitContactForm(INITIAL_FORM_STATE, getFormData({ botCheckKey: "1x00000000000000000000AA" }));

    // Assert
    expect({ recovery: state.recovery, checked: vi.mocked(visitorBotCheck.passesVisitorBotCheck).mock.calls.length }).toEqual({ recovery: "refresh", checked: 0 });
  });

  it("records an out-of-date page as a warning", async () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAA-current");

    // Act
    await submitContactForm(INITIAL_FORM_STATE, getFormData({ botCheckKey: "1x00000000000000000000AA" }));

    // Assert
    expect(reporting.reportVisitorProblem).toHaveBeenCalledWith(expect.objectContaining({ action: "site.contact_form", code: "outdated_page", severity: "warning" }));
  });

  it("records a message the inbox couldn't save", async () => {
    // Arrange
    vi.mocked(intake.submitNewRequest).mockRejectedValue(new TypeError("database down"));

    // Act
    const state = await submitContactForm(INITIAL_FORM_STATE, getFormData());

    // Assert
    expect({ status: state.status, recorded: vi.mocked(reporting.reportVisitorProblem).mock.calls[0]?.[0] }).toEqual({
      status: "failed",
      recorded: expect.objectContaining({ action: "site.contact_form", stage: "database", severity: "error", code: "TypeError" }),
    });
  });

  it("turns anything unexpected into “didn't send”, keeping the text, instead of a crash screen", async () => {
    // Arrange
    vi.mocked(visitorModule.fetchVisitor).mockRejectedValue(new Error("headers unavailable"));

    // Act
    const state = await submitContactForm(INITIAL_FORM_STATE, getFormData());

    // Assert
    expect({ status: state.status, message: state.values.message }).toEqual({ status: "failed", message: "Can I see 100 Main St?" });
  });
});
