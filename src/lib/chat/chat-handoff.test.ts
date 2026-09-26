import { beforeEach, describe, expect, it, vi } from "vitest";

import { submitChatHandoff } from "@/lib/chat/chat-handoff";
import * as chatLog from "@/lib/chat/chat-log";
import * as intake from "@/lib/forms/intake";
import * as turnstile from "@/lib/security/turnstile";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/chat/chat-log", () => ({ fetchOpenChatSession: vi.fn(), linkChatHandoff: vi.fn() }));
vi.mock("@/lib/forms/intake", () => ({ submitNewRequest: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ isOverFormLimit: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/security/turnstile", () => ({ TURNSTILE_FIELD: "cf-turnstile-response", verifyTurnstileToken: vi.fn() }));
// Visitor without advertising consent: no attribution, no Meta event, no hashed contact.
vi.mock("@/lib/tracking/lead-tracking", () => ({
  fetchLeadTracking: vi.fn().mockResolvedValue({ isAdsAllowed: false, attributionRow: null, fbc: null, fbp: null, sourceUrl: null, userAgent: null }),
  getFormConversion: vi.fn().mockResolvedValue({ eventId: "key", userData: null }),
  scheduleMetaLead: vi.fn(),
}));

const SESSION_ID = "0b6f7c1e-2f4a-4b8e-9a51-6c1d2e3f4a5b";
const VISITOR = { ip: "203.0.113.1", hostname: "www.charliewardrealty.com" };

function getFormData(fields: Record<string, string>): FormData {
  const formData = new FormData();
  const values = { fullName: "Jordan Smith", email: "Jordan@Example.com", phone: "", question: "Can I see 100 Main St?", idempotencyKey: "key", "cf-turnstile-response": "token", ...fields };
  Object.entries(values).forEach(([name, value]) => formData.set(name, value));
  return formData;
}

describe("submitChatHandoff", () => {
  beforeEach(() => {
    vi.mocked(intake.submitNewRequest).mockReset().mockResolvedValue("thread");
    vi.mocked(chatLog.linkChatHandoff).mockReset();
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue({ id: SESSION_ID, tenantId: "tenant", visitorMessageCount: 1, turns: [{ role: "visitor", body: "Hi" }, { role: "assistant", body: "Hello" }] });
    vi.mocked(turnstile.verifyTurnstileToken).mockResolvedValue(true);
  });

  it("sends the question and the chat so far to the inbox, then links the chat", async () => {
    // Arrange / Act
    const state = await submitChatHandoff({ formData: getFormData({ sessionId: SESSION_ID }), visitor: VISITOR });

    // Assert
    expect({ status: state.status, request: vi.mocked(intake.submitNewRequest).mock.calls[0]?.[0], linked: vi.mocked(chatLog.linkChatHandoff).mock.calls[0]?.[0] }).toEqual({
      status: "sent",
      request: {
        source: "chat_handoff",
        contactName: "Jordan Smith",
        contactEmail: "jordan@example.com",
        contactPhone: null,
        subject: "Chat assistant handoff",
        body: "Can I see 100 Main St?\n\nChat with the AI assistant so far:\nVisitor: Hi\nAssistant (AI): Hello",
        idempotencyKey: "key",
        attribution: null,
      },
      linked: { sessionId: SESSION_ID, threadId: "thread" },
    });
  });

  it("still reaches the inbox when the chat has expired", async () => {
    // Arrange
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue(null);

    // Act
    const state = await submitChatHandoff({ formData: getFormData({ sessionId: SESSION_ID }), visitor: VISITOR });

    // Assert
    expect({ status: state.status, body: vi.mocked(intake.submitNewRequest).mock.calls[0]?.[0].body, links: vi.mocked(chatLog.linkChatHandoff).mock.calls.length }).toEqual({ status: "sent", body: "Can I see 100 Main St?", links: 0 });
  });

  it("works without any chat, straight from “Talk to a person”", async () => {
    // Arrange / Act
    const state = await submitChatHandoff({ formData: getFormData({ sessionId: "" }), visitor: VISITOR });

    // Assert
    expect({ status: state.status, lookups: vi.mocked(chatLog.fetchOpenChatSession).mock.calls.length }).toEqual({ status: "sent", lookups: 0 });
  });

  it("asks for an email or phone before anything is saved", async () => {
    // Arrange
    vi.mocked(chatLog.fetchOpenChatSession).mockClear();

    // Act
    const state = await submitChatHandoff({ formData: getFormData({ email: "" }), visitor: VISITOR });

    // Assert
    expect({ status: state.status, error: state.fieldErrors.email, saved: vi.mocked(intake.submitNewRequest).mock.calls.length }).toEqual({ status: "invalid", error: "Enter an email or a phone number so we can reply", saved: 0 });
  });

  it("refuses a request that fails the bot check", async () => {
    // Arrange
    vi.mocked(turnstile.verifyTurnstileToken).mockResolvedValue(false);

    // Act
    const state = await submitChatHandoff({ formData: getFormData({}), visitor: VISITOR });

    // Assert
    expect({ status: state.status, saved: vi.mocked(intake.submitNewRequest).mock.calls.length }).toEqual({ status: "blocked", saved: 0 });
  });
});
