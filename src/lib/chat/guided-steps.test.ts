import { beforeEach, describe, expect, it, vi } from "vitest";

import * as chatLog from "@/lib/chat/chat-log";
import { fetchGuidedMenu, getGuidedAnswers, getQuickAnswerStatuses, recordGuidedStep } from "@/lib/chat/guided-steps";
import { EMERGENCY_TEXT } from "@/lib/chat/handoff-text";
import * as rateLimit from "@/lib/security/rate-limit";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/chat/chat-log", () => ({
  fetchChatTenantId: vi.fn(),
  fetchOpenChatSession: vi.fn(),
  fetchPublishedPolicy: vi.fn(),
  isOverHourlyTopicChatLimit: vi.fn(),
  recordGuidedExchange: vi.fn(),
  startChatSession: vi.fn(),
}));
vi.mock("@/lib/security/rate-limit", () => ({ isOverGuidedLimit: vi.fn() }));

// Made-up policy text: the real one never goes in the repo.
const POLICY_BODY = ["# Emergencies", "Call 911 first.", "# Quick answer: Buying a home", "We guide buyers to the keys.", "# Quick answer: About our team", "x".repeat(601)].join("\n");
const SESSION_ID = "0b6f7c1e-2f4a-4b8e-9a51-6c1d2e3f4a5b";
const NEW_SESSION_ID = "1c7a8d2f-3a5b-4c9f-8b62-7d2e3f4a5b6c";
const VISITOR = { ip: "203.0.113.1", hostname: "www.charliewardrealty.com" };
const SESSION = { id: SESSION_ID, tenantId: "tenant", typedQuestionCount: 0, guidedStepCount: 0, turns: [] };

describe("getGuidedAnswers", () => {
  it("answers only from quick-answer sections that exist and are short enough", () => {
    // Arrange / Act
    const answers = getGuidedAnswers(POLICY_BODY);

    // Assert
    expect(answers).toEqual({ buying: { text: "We guide buyers to the keys.", section: "Quick answer: Buying a home" } });
  });
});

describe("getQuickAnswerStatuses", () => {
  it("tells the owner which answers are ready, missing, or too long", () => {
    // Arrange / Act
    const statuses = getQuickAnswerStatuses(POLICY_BODY);

    // Assert
    expect([statuses.find((status) => status.title === "Quick answer: Buying a home")?.state, statuses.find((status) => status.title === "Quick answer: About our team")?.state, statuses.find((status) => status.title === "Quick answer: Get started")?.state]).toEqual(["ready", "too_long", "missing"]);
  });
});

describe("fetchGuidedMenu", () => {
  beforeEach(() => {
    vi.mocked(chatLog.fetchChatTenantId).mockResolvedValue("tenant");
  });

  it("is unavailable without a published policy, so the chat looks as it does today", async () => {
    // Arrange
    vi.mocked(chatLog.fetchPublishedPolicy).mockResolvedValue(null);

    // Act
    const menu = await fetchGuidedMenu();

    // Assert
    expect(menu).toEqual({ status: "unavailable" });
  });

  it("names the section the emergency answer cites", async () => {
    // Arrange
    vi.mocked(chatLog.fetchPublishedPolicy).mockResolvedValue({ id: "policy", body: POLICY_BODY });

    // Act
    const menu = await fetchGuidedMenu();

    // Assert
    expect(menu.status === "ready" && menu.emergencySection).toBe("Emergencies");
  });
});

describe("recordGuidedStep", () => {
  beforeEach(() => {
    vi.mocked(chatLog.fetchChatTenantId).mockResolvedValue("tenant");
    vi.mocked(chatLog.fetchPublishedPolicy).mockResolvedValue({ id: "policy", body: POLICY_BODY });
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue(SESSION);
    vi.mocked(chatLog.startChatSession).mockResolvedValue({ ...SESSION, id: NEW_SESSION_ID });
    vi.mocked(chatLog.isOverHourlyTopicChatLimit).mockResolvedValue(false);
    vi.mocked(chatLog.recordGuidedExchange).mockReset();
    vi.mocked(rateLimit.isOverGuidedLimit).mockResolvedValue(false);
  });

  it("saves the button and the answer from the policy, never text from the browser", async () => {
    // Arrange / Act
    const result = await recordGuidedStep({ input: { sessionId: SESSION_ID, nodeId: "buying" }, visitor: VISITOR });

    // Assert
    expect({ result, saved: vi.mocked(chatLog.recordGuidedExchange).mock.calls[0]?.[0].exchange }).toEqual({
      result: { status: "recorded", sessionId: SESSION_ID },
      saved: { label: "Buying a home", text: "We guide buyers to the keys.", section: "Quick answer: Buying a home" },
    });
  });

  it("starts a chat for a visitor's first tap, and a new one when the old chat has expired", async () => {
    // Arrange
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue(null);
    vi.mocked(chatLog.startChatSession).mockClear();

    // Act
    const results = [await recordGuidedStep({ input: { sessionId: null, nodeId: "buying" }, visitor: VISITOR }), await recordGuidedStep({ input: { sessionId: SESSION_ID, nodeId: "buying" }, visitor: VISITOR })];

    // Assert
    expect({ results, startedByTopic: vi.mocked(chatLog.startChatSession).mock.calls.map(([request]) => request.isTopicStart) }).toEqual({
      results: [
        { status: "recorded", sessionId: NEW_SESSION_ID },
        { status: "recorded", sessionId: NEW_SESSION_ID },
      ],
      startedByTopic: [true, true],
    });
  });

  it("saves the emergency answer even when the policy has no Emergencies section", async () => {
    // Arrange
    vi.mocked(chatLog.fetchPublishedPolicy).mockResolvedValue(null);

    // Act
    await recordGuidedStep({ input: { sessionId: SESSION_ID, nodeId: "emergency" }, visitor: VISITOR });

    // Assert
    expect(vi.mocked(chatLog.recordGuidedExchange).mock.calls[0]?.[0].exchange).toEqual({ label: "Emergency help", text: EMERGENCY_TEXT, section: "" });
  });

  it.each([
    ["an unknown button", { sessionId: SESSION_ID, nodeId: "made-up" }],
    ["a branch, which has no answer of its own", { sessionId: SESSION_ID, nodeId: "buy-sell" }],
    ["a button whose answer was removed from the policy", { sessionId: SESSION_ID, nodeId: "touchup-cost" }],
    ["a malformed chat id", { sessionId: "not-a-uuid", nodeId: "buying" }],
  ])("skips %s without saving anything", async (_case, input) => {
    // Arrange / Act
    const result = await recordGuidedStep({ input, visitor: VISITOR });

    // Assert
    expect({ result, saves: vi.mocked(chatLog.recordGuidedExchange).mock.calls.length }).toEqual({ result: { status: "skipped" }, saves: 0 });
  });

  it("skips saving when the visitor taps too fast, the site is at its hourly limit, or the chat has 40 taps", async () => {
    // Arrange
    vi.mocked(rateLimit.isOverGuidedLimit).mockResolvedValueOnce(true);
    const tooFast = await recordGuidedStep({ input: { sessionId: SESSION_ID, nodeId: "buying" }, visitor: VISITOR });
    vi.mocked(chatLog.isOverHourlyTopicChatLimit).mockResolvedValueOnce(true);
    const atHourlyLimit = await recordGuidedStep({ input: { sessionId: null, nodeId: "buying" }, visitor: VISITOR });
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValueOnce({ ...SESSION, guidedStepCount: 40 });

    // Act
    const fullChat = await recordGuidedStep({ input: { sessionId: SESSION_ID, nodeId: "buying" }, visitor: VISITOR });

    // Assert
    expect({ tooFast, atHourlyLimit, fullChat, saves: vi.mocked(chatLog.recordGuidedExchange).mock.calls.length }).toEqual({ tooFast: { status: "skipped" }, atHourlyLimit: { status: "skipped" }, fullChat: { status: "skipped" }, saves: 0 });
  });
});
