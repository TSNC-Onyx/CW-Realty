import { afterEach, describe, expect, it, vi } from "vitest";

import { MetaConversionsError, getMetaServerEvent, sendMetaServerEvent } from "@/lib/tracking/meta-conversions";

vi.mock("server-only", () => ({}));

const INPUT = {
  eventName: "Lead" as const,
  eventId: "4f1c2a8e-0000-4000-8000-000000000001",
  occurredAt: new Date("2026-09-25T12:00:00Z"),
  sourceUrl: "https://www.charliewardrealty.com/contact",
  emailHash: "e".repeat(64),
  phoneHash: null,
  fbc: null,
  fbp: "fb.1.1727265600000.1234567890",
  clientIp: "203.0.113.1",
  userAgent: "Mozilla/5.0",
};

describe("getMetaServerEvent", () => {
  it("sends only standard fields, leaving out anything unknown", () => {
    // Arrange / Act
    const event = getMetaServerEvent(INPUT);

    // Assert
    expect(event).toEqual({
      event_name: "Lead",
      event_time: 1790337600,
      event_id: INPUT.eventId,
      action_source: "website",
      event_source_url: INPUT.sourceUrl,
      user_data: { em: [INPUT.emailHash], fbp: INPUT.fbp, client_ip_address: INPUT.clientIp, client_user_agent: INPUT.userAgent },
    });
  });
});

describe("sendMetaServerEvent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the token in a header, never in the address", async () => {
    // Arrange
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    // Act
    await sendMetaServerEvent({ pixelId: "1234567890123", accessToken: "secret-token", event: getMetaServerEvent(INPUT) });

    // Assert
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect({ url, authorization: (init.headers as Record<string, string>).Authorization }).toEqual({ url: "https://graph.facebook.com/v26.0/1234567890123/events", authorization: "Bearer secret-token" });
  });

  it("reports a refused event as a typed error", async () => {
    // Arrange
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })));

    // Act
    const sending = sendMetaServerEvent({ pixelId: "1234567890123", accessToken: "secret-token", event: getMetaServerEvent(INPUT) });

    // Assert
    await expect(sending).rejects.toBeInstanceOf(MetaConversionsError);
  });
});
