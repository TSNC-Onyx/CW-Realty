import { describe, expect, it } from "vitest";

import type { OutgoingEmail } from "@/lib/email/mailersend";
import { getNewRequestAlert, getProblemDigest, getReplyEmail, getTestAlert, getVisitorCopy } from "@/lib/email/messages";

// Locks everything except the HTML so the branded layout (docs/cwr-branded-email-templates-plan.md)
// cannot change what any email says, who gets it, or where replies go.

const OFFICE = { phoneDisplay: "(336) 708-0560", email: "charlie@charliewardrealty.com" };
const SUMMARY = {
  threadUrl: "https://www.charliewardrealty.com/admin/inbox/abc",
  source: "contact",
  contactName: "Jordan Smith",
  contactEmail: "jordan@example.com",
  contactPhone: "(336) 555-0100",
  subject: "Contact form",
  message: "Line one\n\nLine two",
};
const PROBLEM_GROUPS = [
  { section: "Homework", label: "Save an uploaded Homework file", severity: "critical" as const, count: 3, last_seen_at: "2026-09-27T20:00:00Z", reference: "CWR-AAA-BBB" },
];

function getWording({ subject, text, to, replyTo }: OutgoingEmail) {
  return { subject, text, to, replyTo };
}

describe("email wording stays the same", () => {
  it("new request alert", () => {
    // Act
    const email = getNewRequestAlert(SUMMARY, "desk@example.com");

    // Assert
    expect(getWording(email)).toMatchInlineSnapshot(`
      {
        "replyTo": undefined,
        "subject": "New contact form from Jordan Smith",
        "text": "From: Jordan Smith
      Email: jordan@example.com
      Phone: (336) 555-0100
      Came from: Contact form

      Line one

      Line two

      Open it in the inbox: https://www.charliewardrealty.com/admin/inbox/abc",
        "to": {
          "email": "desk@example.com",
        },
      }
    `);
  });

  it("visitor copy", () => {
    // Act
    const email = getVisitorCopy({ name: "Jordan Smith", email: "jordan@example.com", office: OFFICE });

    // Assert
    expect(getWording(email)).toMatchInlineSnapshot(`
      {
        "replyTo": {
          "email": "charlie@charliewardrealty.com",
          "name": "Charlie Ward Realty",
        },
        "subject": "We got your message — Charlie Ward Realty",
        "text": "Hi Jordan,

      Thanks for contacting Charlie Ward Realty. We got your message and will reply within one business day. If it's urgent, call or text (336) 708-0560.",
        "to": {
          "email": "jordan@example.com",
        },
      }
    `);
  });

  it("inbox reply", () => {
    // Act
    const email = getReplyEmail({ name: "Jordan Smith", email: "jordan@example.com", reply: "Thanks, Jordan.\n\nSee you Friday.", office: OFFICE });

    // Assert
    expect(getWording(email)).toMatchInlineSnapshot(`
      {
        "replyTo": {
          "email": "charlie@charliewardrealty.com",
          "name": "Charlie Ward Realty",
        },
        "subject": "Re: your message to Charlie Ward Realty",
        "text": "Thanks, Jordan.

      See you Friday.

      —
      Charlie Ward Realty · (336) 708-0560 · Reply to this email to answer.",
        "to": {
          "email": "jordan@example.com",
          "name": "Jordan Smith",
        },
      }
    `);
  });

  it("test alert", () => {
    // Act
    const email = getTestAlert("desk@example.com");

    // Assert
    expect(getWording(email)).toMatchInlineSnapshot(`
      {
        "replyTo": undefined,
        "subject": "Test alert from the CWR website",
        "text": "This is a test alert from the CWR website. If you can read this, new requests will reach you.",
        "to": {
          "email": "desk@example.com",
        },
      }
    `);
  });

  it("problem digest", () => {
    // Act
    const email = getProblemDigest({ groups: PROBLEM_GROUPS, recipient: "owner@example.com", adminUrl: "https://www.charliewardrealty.com/admin" });

    // Assert
    expect(getWording(email)).toMatchInlineSnapshot(`
      {
        "replyTo": undefined,
        "subject": "Urgent: CWR website problem need attention",
        "text": "Something on the CWR website isn't working as it should. These are problems people ran into in the admin portal:

      Urgent — Homework: Save an uploaded Homework file. Happened 3 times, most recently Sep 27, 2026, 4:00 PM. Reference: CWR-AAA-BBB.

      Quote a reference code to your developer to find the details. The admin portal: https://www.charliewardrealty.com/admin",
        "to": {
          "email": "owner@example.com",
        },
      }
    `);
  });
});
