import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendChatMessageAction, submitChatHandoffAction } from "@/lib/chat/chat-actions";
import * as chatHandoff from "@/lib/chat/chat-handoff";
import * as sendChat from "@/lib/chat/send-chat-message";
import { INITIAL_FORM_STATE } from "@/lib/forms/form-state";
import * as reporting from "@/lib/observability/report-visitor-problem";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/chat/chat-handoff", () => ({ submitChatHandoff: vi.fn() }));
vi.mock("@/lib/chat/send-chat-message", () => ({ sendChatMessage: vi.fn() }));
vi.mock("@/lib/chat/chat-log", () => ({ ChatLogError: class ChatLogError extends Error {} }));
vi.mock("@/lib/observability/report-visitor-problem", () => ({ reportVisitorProblem: vi.fn(), getErrorName: (error: unknown) => (error instanceof Error ? error.name : "unknown") }));
vi.mock("@/lib/security/visitor", () => ({ fetchVisitor: vi.fn().mockResolvedValue({ ip: null, hostname: null }) }));

function getHandoffFormData(): FormData {
  const formData = new FormData();
  formData.set("fullName", "Jordan Smith");
  formData.set("question", "Can I see 100 Main St?");
  return formData;
}

describe("chat entry points", () => {
  beforeEach(() => {
    vi.mocked(reporting.reportVisitorProblem).mockReset();
  });

  it("records a lost “Talk to a person” request as an error", async () => {
    // Arrange
    vi.mocked(chatHandoff.submitChatHandoff).mockRejectedValue(new TypeError("database down"));

    // Act
    await submitChatHandoffAction(INITIAL_FORM_STATE, getHandoffFormData());

    // Assert
    expect(reporting.reportVisitorProblem).toHaveBeenCalledWith(expect.objectContaining({ action: "site.chat_handoff", severity: "error", code: "TypeError" }));
  });

  it("keeps what the visitor typed when the request couldn't be saved", async () => {
    // Arrange
    vi.mocked(chatHandoff.submitChatHandoff).mockRejectedValue(new TypeError("database down"));

    // Act
    const state = await submitChatHandoffAction(INITIAL_FORM_STATE, getHandoffFormData());

    // Assert
    expect({ status: state.status, question: state.values.question }).toEqual({ status: "failed", question: "Can I see 100 Main St?" });
  });

  it("records a failed chat message and answers with a message, never a crash", async () => {
    // Arrange
    vi.mocked(sendChat.sendChatMessage).mockRejectedValue(new Error("boom"));

    // Act
    const result = await sendChatMessageAction({ sessionId: null, message: "Hi", turnstileToken: "" });

    // Assert
    expect({ status: result.status, recorded: vi.mocked(reporting.reportVisitorProblem).mock.calls.length }).toEqual({ status: "error", recorded: 1 });
  });
});
