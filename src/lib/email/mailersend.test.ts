import { afterEach, describe, expect, it, vi } from "vitest";

import { EmailSendError, sendWithMailerSend } from "@/lib/email/mailersend";

const EMAIL = { to: { email: "desk@example.com" }, subject: "Hi", text: "Hi", html: "<p>Hi</p>" };
const SETTINGS = { apiKey: "test-key", from: { email: "alerts@notify.example.com", name: "CWR website" } };

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("sendWithMailerSend", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns MailerSend's message ID when the email is accepted", async () => {
    // Arrange
    stubFetch(new Response(null, { status: 202, headers: { "x-message-id": "msg-123" } }));

    // Act
    const messageId = await sendWithMailerSend(EMAIL, SETTINGS);

    // Assert
    expect(messageId).toBe("msg-123");
  });

  it("marks rate limits and outages as worth retrying", async () => {
    // Arrange
    stubFetch(new Response("slow down", { status: 429 }));

    // Act
    const sending = sendWithMailerSend(EMAIL, SETTINGS);

    // Assert
    await expect(sending).rejects.toMatchObject({ context: { status: 429, isRetryable: true } });
  });

  it("marks a rejected email as not worth retrying", async () => {
    // Arrange
    stubFetch(new Response("bad address", { status: 422 }));

    // Act
    const sending = sendWithMailerSend(EMAIL, SETTINGS);

    // Assert
    await expect(sending).rejects.toBeInstanceOf(EmailSendError);
    await expect(sendWithMailerSend(EMAIL, SETTINGS).catch((error: EmailSendError) => error.context.isRetryable)).resolves.toBe(false);
  });
});
