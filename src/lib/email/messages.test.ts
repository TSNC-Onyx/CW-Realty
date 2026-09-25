import { describe, expect, it } from "vitest";

import { getEscapedHtml, getNewRequestAlert, getVisitorCopy } from "@/lib/email/messages";

const OFFICE = { phoneDisplay: "(336) 708-0560", email: "charlie@charliewardrealty.com" };

const SUMMARY = {
  threadUrl: "https://www.charliewardrealty.com/admin/inbox/abc",
  source: "contact",
  contactName: "Jordan <b>Smith</b>",
  contactEmail: "jordan@example.com",
  contactPhone: null,
  subject: "Contact form",
  message: "Line one\n\n<script>alert(1)</script>",
};

describe("alert emails", () => {
  it("escapes visitor text in the HTML version", () => {
    // Arrange
    const summary = SUMMARY;

    // Act
    const email = getNewRequestAlert(summary, "desk@example.com");

    // Assert
    expect(email.html).not.toContain("<script>");
  });

  it("keeps the subject on one line even if a name has line breaks", () => {
    // Arrange
    const summary = { ...SUMMARY, contactName: "Jordan\r\nBcc: attacker@example.com" };

    // Act
    const email = getNewRequestAlert(summary, "desk@example.com");

    // Assert
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("tells the visitor when to expect a reply and lets them answer the office", () => {
    // Arrange
    const input = { name: "Jordan Smith", email: "jordan@example.com", office: OFFICE };

    // Act
    const email = getVisitorCopy(input);

    // Assert
    expect([email.text.includes("within one business day"), email.replyTo?.email]).toEqual([true, OFFICE.email]);
  });

  it("greets with a plain first name and never repeats visitor text", () => {
    // Arrange
    const input = { name: "Click-https://phish.example/login now", email: "victim@example.com", office: OFFICE };

    // Act
    const email = getVisitorCopy(input);

    // Assert
    expect([email.text.startsWith("Hi there,"), email.text.includes("phish")]).toEqual([true, false]);
  });

  it("escapes every HTML special character", () => {
    // Arrange
    const text = `<a href="x">'&'</a>`;

    // Act
    const escaped = getEscapedHtml(text);

    // Assert
    expect(escaped).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
