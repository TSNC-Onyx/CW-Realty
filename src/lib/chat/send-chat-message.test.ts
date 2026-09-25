import { beforeEach, describe, expect, it, vi } from "vitest";

import { HANDOFF_TEXT } from "@/lib/chat/assistant-reply";
import * as chatLog from "@/lib/chat/chat-log";
import * as claudeModel from "@/lib/chat/claude-model";
import { sendChatMessage } from "@/lib/chat/send-chat-message";
import * as turnstile from "@/lib/security/turnstile";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/chat/chat-log", () => ({
  fetchChatTenantId: vi.fn(),
  fetchOpenChatSession: vi.fn(),
  fetchPublishedPolicy: vi.fn(),
  isOverHourlyChatLimit: vi.fn(),
  recordChatExchange: vi.fn(),
  startChatSession: vi.fn(),
}));
vi.mock("@/lib/chat/claude-model", () => ({ getClaudeAnswerModel: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ isOverChatLimit: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/security/turnstile", () => ({ verifyTurnstileToken: vi.fn() }));

const SESSION_ID = "0b6f7c1e-2f4a-4b8e-9a51-6c1d2e3f4a5b";
const VISITOR = { ip: "203.0.113.1", hostname: "www.charliewardrealty.com" };
const SESSION = { id: SESSION_ID, tenantId: "tenant", visitorMessageCount: 0, turns: [] };
const POLICY = { id: "policy", body: "# Office hours\nWeekdays 9 to 5." };

function getInput(overrides: Partial<{ sessionId: string | null; message: string }> = {}) {
  return { sessionId: SESSION_ID, message: "When are you open?", turnstileToken: "token", ...overrides };
}

describe("sendChatMessage", () => {
  beforeEach(() => {
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue(SESSION);
    vi.mocked(chatLog.fetchPublishedPolicy).mockResolvedValue(POLICY);
    vi.mocked(chatLog.fetchChatTenantId).mockResolvedValue("tenant");
    vi.mocked(chatLog.isOverHourlyChatLimit).mockResolvedValue(false);
    vi.mocked(chatLog.startChatSession).mockResolvedValue(SESSION);
    vi.mocked(chatLog.recordChatExchange).mockReset();
    vi.mocked(turnstile.verifyTurnstileToken).mockResolvedValue(true);
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(async () => ({ outcome: "answer", reply: "Weekdays, 9 to 5.", citedSections: ["Office hours"] }));
  });

  it("answers and logs the exchange", async () => {
    // Arrange / Act
    const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect({ result, logged: vi.mocked(chatLog.recordChatExchange).mock.calls.length }).toEqual({
      result: { status: "replied", sessionId: SESSION_ID, question: "When are you open?", reply: { outcome: "answer", text: "Weekdays, 9 to 5.", citedSections: ["Office hours"] } },
      logged: 1,
    });
  });

  it("refuses to start a chat when the bot check fails", async () => {
    // Arrange
    vi.mocked(turnstile.verifyTurnstileToken).mockResolvedValue(false);

    // Act
    const result = await sendChatMessage({ input: getInput({ sessionId: null }), visitor: VISITOR });

    // Assert
    expect({ status: result.status, started: vi.mocked(chatLog.startChatSession).mock.calls.length }).toEqual({ status: "error", started: 0 });
  });

  it("tells the widget to start over when the chat has expired", async () => {
    // Arrange
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue(null);

    // Act
    const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect(result).toEqual({ status: "expired" });
  });

  it("stops a chat at the message limit", async () => {
    // Arrange
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue({ ...SESSION, visitorMessageCount: 20 });

    // Act
    const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect(result.status).toBe("error");
  });

  it("offers a person without starting a chat once the hourly limit is reached", async () => {
    // Arrange
    vi.mocked(chatLog.isOverHourlyChatLimit).mockResolvedValue(true);
    vi.mocked(chatLog.startChatSession).mockClear();

    // Act
    const result = await sendChatMessage({ input: getInput({ sessionId: null }), visitor: VISITOR });

    // Assert
    expect({ result, started: vi.mocked(chatLog.startChatSession).mock.calls.length }).toEqual({
      result: { status: "replied", sessionId: null, question: "When are you open?", reply: { outcome: "handoff", text: HANDOFF_TEXT.unavailable, citedSections: [] } },
      started: 0,
    });
  });

  it("hands off when no API key is set", async () => {
    // Arrange
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(null);

    // Act
    const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect(result.status === "replied" && result.reply.text).toBe(HANDOFF_TEXT.unavailable);
  });

  it("hands off when the model call fails", async () => {
    // Arrange
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(async () => {
      throw new Error("timeout");
    });

    // Act
    const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect(result.status === "replied" && result.reply.text).toBe(HANDOFF_TEXT.unavailable);
  });

  it("returns the question with ID numbers removed, for the widget to show and keep", async () => {
    // Arrange / Act
    const result = await sendChatMessage({ input: getInput({ message: "My SSN is 123-45-6789" }), visitor: VISITOR });

    // Assert
    expect(result.status === "replied" && result.question).toBe("My SSN is [number removed]");
  });

  it("sends the model only the latest turns of a long chat", async () => {
    // Arrange
    const model = vi.fn().mockResolvedValue(null);
    const turns = Array.from({ length: 30 }, (_unused, index) => ({ role: index % 2 === 0 ? ("visitor" as const) : ("assistant" as const), body: `turn ${index}` }));
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue({ ...SESSION, visitorMessageCount: 15, turns });
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(model);

    // Act
    await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect(model.mock.calls[0]?.[0].turns).toHaveLength(21);
  });

  it("rejects an empty question before doing any work", async () => {
    // Arrange / Act
    const result = await sendChatMessage({ input: getInput({ message: "   " }), visitor: VISITOR });

    // Assert
    expect(result).toEqual({ status: "error", message: "Type a question first" });
  });
});
