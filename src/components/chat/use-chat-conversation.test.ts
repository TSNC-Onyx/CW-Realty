import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchChatResult } from "@/components/chat/use-chat-conversation";
import * as chatActions from "@/lib/chat/chat-actions";
import * as reporting from "@/lib/observability/report-client-problem";

vi.mock("@/lib/chat/chat-actions", () => ({ sendChatMessageAction: vi.fn() }));
vi.mock("@/lib/observability/report-client-problem", () => ({ reportVisitorClientProblem: vi.fn() }));

const INPUT = { sessionId: null, message: "Do you work in High Point?", turnstileToken: "token", botCheckKey: "key" };

describe("a chat message call from the widget", () => {
  beforeEach(() => {
    vi.mocked(reporting.reportVisitorClientProblem).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks an out-of-date page to refresh when the site was updated while it was open", async () => {
    // Arrange
    vi.mocked(chatActions.sendChatMessageAction).mockRejectedValue(new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'));

    // Act
    const result = await fetchChatResult(INPUT);

    // Assert
    expect(result).toMatchObject({ status: "error", recovery: "refresh" });
  });

  it("turns a dropped connection into a message instead of a frozen chat", async () => {
    // Arrange
    vi.mocked(chatActions.sendChatMessageAction).mockRejectedValue(new TypeError("Failed to fetch"));

    // Act
    const result = await fetchChatResult(INPUT);

    // Assert
    expect(result).toEqual({ status: "error", message: "I'm sorry, I couldn't get your message through. Please try again, or tap “Talk to a person”." });
  });

  it("records the failure as a visitor's chat window problem", async () => {
    // Arrange
    vi.mocked(chatActions.sendChatMessageAction).mockRejectedValue(new TypeError("Failed to fetch"));

    // Act
    await fetchChatResult(INPUT);

    // Assert
    expect(reporting.reportVisitorClientProblem).toHaveBeenCalledWith(expect.objectContaining({ action: "site.chat_widget", code: "network" }));
  });

  it("isn't recorded while the visitor's own browser is offline", async () => {
    // Arrange
    vi.stubGlobal("navigator", { onLine: false });
    vi.mocked(chatActions.sendChatMessageAction).mockRejectedValue(new TypeError("Failed to fetch"));

    // Act
    const result = await fetchChatResult(INPUT);

    // Assert
    expect({ status: result.status, calls: vi.mocked(reporting.reportVisitorClientProblem).mock.calls.length }).toEqual({ status: "error", calls: 0 });
  });
});
