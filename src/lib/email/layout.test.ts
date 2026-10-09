import { describe, expect, it } from "vitest";

import { EmailLayoutError, getBrandedEmailHtml, type BrandedEmail } from "@/lib/email/layout";
import { getNewRequestAlert, getReplyEmail } from "@/lib/email/messages";
import { SITE_URL } from "@/lib/site/navigation";

const GMAIL_CLIP_BYTES = 102 * 1024;
const MAX_REPLY_LENGTH = 20_000;
const OFFICE = { phoneDisplay: "(336) 708-0560", email: "charlie@charliewardrealty.com" };
const EMAIL: BrandedEmail = {
  preheader: "Preview text",
  heading: "Heading",
  bodyHtml: "<p>Body</p>",
  button: { label: "Open", url: `${SITE_URL}/admin` },
  footerLines: ["Charlie Ward Realty · (336) 708-0560"],
};

function getHeadlessHtml(html: string): string {
  return html.replace(/<head>.*<\/head>/s, "");
}

describe("branded email layout", () => {
  it("escapes footer lines", () => {
    // Arrange
    const email = { ...EMAIL, footerLines: [`<a href="https://phish.example">Call us</a>`] };

    // Act
    const html = getBrandedEmailHtml(email);

    // Assert
    expect(html).not.toContain("phish.example\">");
  });

  it("escapes the heading and preview text", () => {
    // Arrange
    const email = { ...EMAIL, heading: "<b>Hi</b>", preheader: "<i>Hey</i>" };

    // Act
    const html = getBrandedEmailHtml(email);

    // Assert
    expect([html.includes("<b>Hi</b>"), html.includes("<i>Hey</i>")]).toEqual([false, false]);
  });

  it.each(["http://example.com", "javascript:alert(1)", "mailto:x@example.com"])("refuses a %s button link", (url) => {
    // Arrange
    const email = { ...EMAIL, button: { label: "Open", url } };

    // Act
    const building = () => getBrandedEmailHtml(email);

    // Assert
    expect(building).toThrow(EmailLayoutError);
  });

  it("marks every table as layout only for screen readers", () => {
    // Act
    const html = getBrandedEmailHtml(EMAIL);

    // Assert
    expect(html.match(/<table(?![^>]*role="presentation")/g)).toBeNull();
  });

  it("declares English and has exactly one main heading", () => {
    // Act
    const html = getBrandedEmailHtml(EMAIL);

    // Assert
    expect([html.includes('<html lang="en">'), html.match(/<h1/g)?.length]).toEqual([true, 1]);
  });

  it("gives the logo alt text", () => {
    // Act
    const html = getBrandedEmailHtml(EMAIL);

    // Assert
    expect(html).toMatch(/<img [^>]*alt="CWR Real Estate"/);
  });

  it("has no HTML comments", () => {
    // Act
    const html = getBrandedEmailHtml(EMAIL);

    // Assert
    expect(html).not.toContain("<!--");
  });

  it("keeps its width and hides the preview text without the <head> styles", () => {
    // Act
    const html = getHeadlessHtml(getBrandedEmailHtml(EMAIL));

    // Assert
    expect([html.includes('width="600"'), /<div style="display:none;[^"]*">Preview text<\/div>/.test(html)]).toEqual([true, true]);
  });

  it("shrinks to fit phone screens", () => {
    // Act
    const html = getBrandedEmailHtml(EMAIL);

    // Assert
    expect(html).toContain('width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;"');
  });

  it("never needs a class for its look (every classed element also has inline styles)", () => {
    // Act
    const html = getHeadlessHtml(getBrandedEmailHtml(EMAIL));

    // Assert
    expect(html.match(/<[a-z0-9]+ (?![^>]*style=")[^>]*class="[^"]*"[^>]*>/g)).toBeNull();
  });

  it("stays under Gmail's clipping size with the longest allowed reply", () => {
    // Arrange
    const reply = "We can meet at the house on Friday. ".repeat(MAX_REPLY_LENGTH / 36).slice(0, MAX_REPLY_LENGTH);

    // Act
    const html = getReplyEmail({ name: "Jordan Smith", email: "jordan@example.com", reply, office: OFFICE }).html;

    // Assert
    expect(new TextEncoder().encode(html).length).toBeLessThan(GMAIL_CLIP_BYTES);
  });

  it("builds the new-request button from the site address", () => {
    // Arrange
    const summary = { threadUrl: `${SITE_URL}/admin/inbox/abc`, source: "contact", contactName: "Jordan", contactEmail: null, contactPhone: null, subject: "Contact form", message: "Hi" };

    // Act
    const html = getNewRequestAlert(summary, "desk@example.com").html;

    // Assert
    expect(html).toContain(`href="${SITE_URL}/admin/inbox/abc"`);
  });
});
