import { beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(result).toEqual({ status: "error", message: "We couldn't reach the assistant. Try again, or tap “Talk to a person”." });
  });

  it("records the failure as a visitor's chat window problem", async () => {
    // Arrange
    vi.mocked(chatActions.sendChatMessageAction).mockRejectedValue(new TypeError("Failed to fetch"));

    // Act
    await fetchChatResult(INPUT);

    // Assert
    expect(reporting.reportVisitorClientProblem).toHaveBeenCalledWith(expect.objectContaining({ action: "site.chat_widget", code: "network" }));
  });
});
