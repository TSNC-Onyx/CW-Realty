import { describe, expect, it, vi } from "vitest";

import { EmailSendError } from "@/lib/email/mailersend";
import type { JobDependencies } from "@/lib/jobs/alert-jobs";
import { deliverEmail, type DeliveryRequest } from "@/lib/jobs/deliveries";

type Row = { id: string; status: string; attempts: number } | null;

type FakeSetup = { existing: Row; claimed?: Row; send: JobDependencies["sendEmail"] };

// A stand-in for the delivery log table: the lookup returns `existing`, the claim returns
// `claimed`, and every outcome update is recorded.
function getFakeDependencies({ existing, claimed = { id: "d1", status: "sending", attempts: 0 }, send }: FakeSetup) {
  const outcomes: Record<string, unknown>[] = [];
  let isClaiming = false;
  const query = {
    select: () => query,
    eq: () => query,
    or: () => query,
    insert: () => query,
    update: (fields: Record<string, unknown>) => {
      isClaiming = fields.status === "sending";
      if (!isClaiming) outcomes.push(fields);
      return Object.assign(Promise.resolve({ error: null }), query);
    },
    maybeSingle: async () => ({ data: isClaiming ? claimed : existing, error: null }),
    single: async () => ({ data: { id: "d1", status: "pending", attempts: 0 }, error: null }),
  };
  const deps = { db: { from: () => query }, sendEmail: send, siteUrl: "https://example.com" } as unknown as JobDependencies;
  return { deps, outcomes };
}

const REQUEST: DeliveryRequest = {
  tenantId: "tenant-1",
  kind: "new_request",
  threadId: "thread-1",
  messageId: null,
  jobRunId: null,
  email: { to: { email: "Desk@Example.com" }, subject: "New", text: "New", html: "<p>New</p>" },
};

describe("deliverEmail", () => {
  it("never sends an email that already went out", async () => {
    // Arrange
    const send = vi.fn();
    const { deps } = getFakeDependencies({ existing: { id: "d1", status: "sent", attempts: 1 }, send });

    // Act
    await deliverEmail(deps, REQUEST);

    // Assert
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send while another attempt holds the email, but asks to check again later", async () => {
    // Arrange
    const send = vi.fn();
    const { deps } = getFakeDependencies({ existing: { id: "d1", status: "sending", attempts: 0 }, claimed: null, send });

    // Act
    const shouldRetry = await deliverEmail(deps, REQUEST);

    // Assert
    expect([send.mock.calls.length, shouldRetry]).toEqual([0, true]);
  });

  it("records a sent email with the provider's message ID", async () => {
    // Arrange
    const { deps, outcomes } = getFakeDependencies({ existing: null, send: async () => ({ status: "sent", providerMessageId: "msg-1" }) });

    // Act
    const shouldRetry = await deliverEmail(deps, REQUEST);

    // Assert
    expect([shouldRetry, outcomes[0]]).toEqual([false, { attempts: 1, status: "sent", provider_message_id: "msg-1", last_error: null }]);
  });

  it("records a provider outage as failed and asks for a retry", async () => {
    // Arrange
    const outage = new EmailSendError("MailerSend answered 503", { status: 503, isRetryable: true });
    const { deps, outcomes } = getFakeDependencies({ existing: { id: "d1", status: "failed", attempts: 1 }, claimed: { id: "d1", status: "sending", attempts: 1 }, send: async () => Promise.reject(outage) });

    // Act
    const shouldRetry = await deliverEmail(deps, REQUEST);

    // Assert
    expect([shouldRetry, outcomes[0]?.status, outcomes[0]?.attempts]).toEqual([true, "failed", 2]);
  });

  it("logs 'not sent' when email isn't set up, without retrying", async () => {
    // Arrange
    const { deps, outcomes } = getFakeDependencies({ existing: null, send: async () => ({ status: "not_sent", reason: "Email sending is not set up yet" }) });

    // Act
    const shouldRetry = await deliverEmail(deps, REQUEST);

    // Assert
    expect([shouldRetry, outcomes[0]?.status]).toEqual([false, "not_sent"]);
  });
});
