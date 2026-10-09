import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HANDOFF_TEXT } from "@/lib/chat/assistant-reply";
import { EMERGENCY_TEXT } from "@/lib/chat/handoff-text";
import * as reporting from "@/lib/observability/report-visitor-problem";
import * as chatLog from "@/lib/chat/chat-log";
import * as claudeModel from "@/lib/chat/claude-model";
import { sendChatMessage } from "@/lib/chat/send-chat-message";
import * as visitorBotCheck from "@/lib/security/visitor-bot-check";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/chat/chat-log", () => ({
  fetchChatTenantId: vi.fn(),
  fetchIsAssistantOn: vi.fn(),
  fetchOpenChatSession: vi.fn(),
  fetchPublishedPolicy: vi.fn(),
  isOverHourlyChatLimit: vi.fn(),
  markFirstQuestion: vi.fn(),
  recordChatExchange: vi.fn(),
  startChatSession: vi.fn(),
}));
vi.mock("@/lib/chat/claude-model", () => ({ getClaudeAnswerModel: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ isOverChatLimit: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/security/visitor-bot-check", () => ({ passesVisitorBotCheck: vi.fn() }));
vi.mock("@/lib/observability/report-visitor-problem", () => ({ reportVisitorProblem: vi.fn() }));

const SESSION_ID = "0b6f7c1e-2f4a-4b8e-9a51-6c1d2e3f4a5b";
const VISITOR = { ip: "203.0.113.1", hostname: "www.charliewardrealty.com" };
const SESSION = { id: SESSION_ID, tenantId: "tenant", typedQuestionCount: 1, guidedStepCount: 0, turns: [] };
const POLICY = { id: "policy", body: "# Office hours\nWeekdays 9 to 5.\n# Emergencies\nIf anyone is in danger, call 911 first." };
const EMERGENCY_QUESTION = "There's a gas leak at my rental. What do I do?";

function getInput(overrides: Partial<{ sessionId: string | null; message: string }> = {}) {
  return { sessionId: SESSION_ID, message: "When are you open?", turnstileToken: "token", ...overrides };
}

describe("sendChatMessage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue(SESSION);
    vi.mocked(chatLog.fetchPublishedPolicy).mockResolvedValue(POLICY);
    vi.mocked(chatLog.fetchChatTenantId).mockResolvedValue("tenant");
    vi.mocked(chatLog.isOverHourlyChatLimit).mockResolvedValue(false);
    vi.mocked(chatLog.startChatSession).mockResolvedValue(SESSION);
    vi.mocked(chatLog.recordChatExchange).mockReset();
    vi.mocked(chatLog.fetchIsAssistantOn).mockResolvedValue(true);
    vi.mocked(visitorBotCheck.passesVisitorBotCheck).mockResolvedValue(true);
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(async () => ({ outcome: "answer", handoffKind: "needs_person", reply: "Weekdays, 9 to 5.", citedSections: ["Office hours"] }));
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
    vi.mocked(visitorBotCheck.passesVisitorBotCheck).mockResolvedValue(false);

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
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue({ ...SESSION, typedQuestionCount: 20 });

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
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(async () => {
      throw new Error("timeout");
    });

    // Act
    const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect(result.status === "replied" && result.reply.text).toBe(HANDOFF_TEXT.unavailable);
  });

  it("rewords the not-available line instead of sending it twice in a row", async () => {
    // Arrange
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(null);
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue({ ...SESSION, turns: [{ role: "visitor", body: "Hi" }, { role: "assistant", body: HANDOFF_TEXT.unavailable }] });

    // Act
    const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect(result.status === "replied" && result.reply.text).toBe(HANDOFF_TEXT.unavailableAgain);
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
    vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue({ ...SESSION, typedQuestionCount: 15, turns });
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

  it("hands off without asking the model when the owner has turned the assistant off", async () => {
    // Arrange
    const model = vi.fn();
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(model);
    vi.mocked(chatLog.fetchIsAssistantOn).mockResolvedValue(false);

    // Act
    const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect({ text: result.status === "replied" && result.reply.text, asked: model.mock.calls.length }).toEqual({ text: HANDOFF_TEXT.unavailable, asked: 0 });
  });

  it("asks an out-of-date page to refresh before spending its Quick Check", async () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAA-current");
    vi.mocked(visitorBotCheck.passesVisitorBotCheck).mockClear();

    // Act
    const result = await sendChatMessage({ input: { ...getInput({ sessionId: null }), botCheckKey: "1x00000000000000000000AA" }, visitor: VISITOR });

    // Assert
    expect({ recovery: result.status === "error" && result.recovery, checked: vi.mocked(visitorBotCheck.passesVisitorBotCheck).mock.calls.length }).toEqual({ recovery: "refresh", checked: 0 });
  });

  it("records that the assistant isn't set up when no policy is published", async () => {
    // Arrange
    vi.mocked(chatLog.fetchPublishedPolicy).mockResolvedValue(null);
    vi.mocked(reporting.reportVisitorProblem).mockClear();

    // Act
    await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect(reporting.reportVisitorProblem).toHaveBeenCalledWith(expect.objectContaining({ action: "site.chat_assistant", code: "no_published_policy", severity: "warning" }));
  });

  it("records a failed model call with how serious it is", async () => {
    // Arrange
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(async () => {
      throw new Error("boom");
    });
    vi.mocked(reporting.reportVisitorProblem).mockClear();

    // Act
    await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect(reporting.reportVisitorProblem).toHaveBeenCalledWith(expect.objectContaining({ action: "site.chat_assistant", severity: "error", code: "Error" }));
  });

  it("records the hourly limit when it turns visitors away", async () => {
    // Arrange
    vi.mocked(chatLog.isOverHourlyChatLimit).mockResolvedValue(true);
    vi.mocked(reporting.reportVisitorProblem).mockClear();

    // Act
    await sendChatMessage({ input: getInput({ sessionId: null }), visitor: VISITOR });

    // Assert
    expect(reporting.reportVisitorProblem).toHaveBeenCalledWith(expect.objectContaining({ code: "hourly_cap" }));
  });

  it("records an answer that failed a server check, without sending the reason to the visitor", async () => {
    // Arrange
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(async () => ({ outcome: "answer", handoffKind: "needs_person", reply: "Weekdays.", citedSections: ["Mortgage advice"] }));
    vi.mocked(reporting.reportVisitorProblem).mockClear();

    // Act
    const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect({ reply: result.status === "replied" ? result.reply : null, reported: vi.mocked(reporting.reportVisitorProblem).mock.calls[0]?.[0] }).toEqual({
      reply: { outcome: "handoff", text: HANDOFF_TEXT.needsPerson, citedSections: [] },
      reported: expect.objectContaining({ action: "site.chat_assistant", stage: "rule", severity: "info", code: "bad_citation" }),
    });
  });

  it("records a blocked AI-written small-talk reply as a warning, with contact details masked, and never sends it to the visitor", async () => {
    // Arrange
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(async () => ({ outcome: "handoff", handoffKind: "conversation", reply: "Sure! SSN 123-45-6789, call 336-555-0123 or jo@example.com.", citedSections: [] }));
    vi.mocked(reporting.reportVisitorProblem).mockClear();

    // Act
    const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect({ reply: result.status === "replied" ? result.reply : null, reported: vi.mocked(reporting.reportVisitorProblem).mock.calls[0]?.[0] }).toEqual({
      reply: { outcome: "handoff", text: HANDOFF_TEXT.conversation, citedSections: [] },
      reported: expect.objectContaining({ code: "unsafe_conversation", severity: "warning", detail: expect.stringContaining("Rejected reply: Sure! SSN [number removed], call ###-###-#### or [email removed]") }),
    });
  });

  it("keeps only the first 200 characters of a blocked reply in the problem log", async () => {
    // Arrange
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(async () => ({ outcome: "handoff", handoffKind: "conversation", reply: `1${"a".repeat(398)}`, citedSections: [] }));
    vi.mocked(reporting.reportVisitorProblem).mockClear();

    // Act
    await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    const detail = vi.mocked(reporting.reportVisitorProblem).mock.calls[0]?.[0].detail ?? "";
    expect(detail.split("Rejected reply: ")[1]?.length).toBe(200);
  });

  it("doesn't record the model's own choice to hand off", async () => {
    // Arrange
    vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(async () => ({ outcome: "handoff", handoffKind: "needs_person", reply: "", citedSections: [] }));
    vi.mocked(reporting.reportVisitorProblem).mockClear();

    // Act
    await sendChatMessage({ input: getInput(), visitor: VISITOR });

    // Assert
    expect(reporting.reportVisitorProblem).not.toHaveBeenCalled();
  });

  describe("emergencies", () => {
    it.each([
      ["the assistant answers normally", () => undefined],
      ["the owner has turned the assistant off", () => vi.mocked(chatLog.fetchIsAssistantOn).mockResolvedValue(false)],
      ["no API key is set", () => vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(null)],
    ])("gives the fixed emergency reply, citing the policy, when %s", async (_case, arrange) => {
      // Arrange
      arrange();

      // Act
      const result = await sendChatMessage({ input: getInput({ message: EMERGENCY_QUESTION }), visitor: VISITOR });

      // Assert
      expect(result.status === "replied" && result.reply).toEqual({ outcome: "answer", text: EMERGENCY_TEXT, citedSections: ["Emergencies"] });
    });

    it("never asks the model about an emergency", async () => {
      // Arrange
      const model = vi.fn();
      vi.mocked(claudeModel.getClaudeAnswerModel).mockReturnValue(model);

      // Act
      await sendChatMessage({ input: getInput({ message: EMERGENCY_QUESTION }), visitor: VISITOR });

      // Assert
      expect(model).not.toHaveBeenCalled();
    });

    it("gives the emergency reply even once the hourly limit is reached", async () => {
      // Arrange
      vi.mocked(chatLog.isOverHourlyChatLimit).mockResolvedValue(true);

      // Act
      const result = await sendChatMessage({ input: getInput({ sessionId: null, message: EMERGENCY_QUESTION }), visitor: VISITOR });

      // Assert
      expect(result.status === "replied" && result.reply.text).toBe(EMERGENCY_TEXT);
    });

    it("still keeps a restricted number out, even in an emergency", async () => {
      // Arrange / Act
      const result = await sendChatMessage({ input: getInput({ message: "Gas leak! My SSN is 123-45-6789" }), visitor: VISITOR });

      // Assert
      expect(result.status === "replied" && result.reply.text).toBe(HANDOFF_TEXT.restrictedNumber);
    });
  });

  describe("chats started by topic buttons", () => {
    const BUTTON_SESSION = { ...SESSION, typedQuestionCount: 0, guidedStepCount: 3 };

    it("runs the Quick Check before the chat's first typed question", async () => {
      // Arrange
      vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue(BUTTON_SESSION);
      vi.mocked(visitorBotCheck.passesVisitorBotCheck).mockClear();

      // Act
      const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

      // Assert
      expect({ status: result.status, checks: vi.mocked(visitorBotCheck.passesVisitorBotCheck).mock.calls.length }).toEqual({ status: "replied", checks: 1 });
    });

    it("refuses the first typed question when the Quick Check fails", async () => {
      // Arrange
      vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue(BUTTON_SESSION);
      vi.mocked(visitorBotCheck.passesVisitorBotCheck).mockResolvedValue(false);

      // Act
      const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

      // Assert
      expect({ status: result.status, logged: vi.mocked(chatLog.recordChatExchange).mock.calls.length }).toEqual({ status: "error", logged: 0 });
    });

    it("joins the hourly limit at the chat's first typed question, and is turned away when it's full", async () => {
      // Arrange
      vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue(BUTTON_SESSION);
      vi.mocked(chatLog.markFirstQuestion).mockClear();
      const marked = await sendChatMessage({ input: getInput(), visitor: VISITOR }).then(() => vi.mocked(chatLog.markFirstQuestion).mock.calls.length);
      vi.mocked(chatLog.isOverHourlyChatLimit).mockResolvedValue(true);

      // Act
      const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

      // Assert
      expect({ marked, reply: result.status === "replied" && result.reply.text }).toEqual({ marked: 1, reply: HANDOFF_TEXT.unavailable });
    });

    it("skips the Quick Check once the chat has a typed question", async () => {
      // Arrange
      vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue({ ...BUTTON_SESSION, typedQuestionCount: 1 });
      vi.mocked(visitorBotCheck.passesVisitorBotCheck).mockClear();

      // Act
      await sendChatMessage({ input: getInput(), visitor: VISITOR });

      // Assert
      expect(vi.mocked(visitorBotCheck.passesVisitorBotCheck)).not.toHaveBeenCalled();
    });

    it("never counts taps toward the 20-question limit", async () => {
      // Arrange
      vi.mocked(chatLog.fetchOpenChatSession).mockResolvedValue({ ...BUTTON_SESSION, typedQuestionCount: 19, guidedStepCount: 30 });

      // Act
      const result = await sendChatMessage({ input: getInput(), visitor: VISITOR });

      // Assert
      expect(result.status).toBe("replied");
    });
  });
});
