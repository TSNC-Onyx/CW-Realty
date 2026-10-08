import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getAuthEmailTemplates } from "@/lib/email/auth-templates";
import { getNewRequestAlert, getProblemDigest, getReplyEmail, getTestAlert, getVisitorCopy } from "@/lib/email/messages";
import { SITE_URL } from "@/lib/site/navigation";

// Keeps supabase/templates/*.html equal to src/lib/email/auth-templates.ts, and (on request,
// never in CI) rewrites those files or writes a local preview of every email.
//   npm run email:templates   → EMAIL_WRITE=1
//   npm run email:preview     → EMAIL_PREVIEW=1, files land in email-preview/

const TEMPLATE_DIR = "supabase/templates";
const PREVIEW_DIR = "email-preview";
const ALLOWED_GO_VARIABLES = new Set(["{{ .SiteURL }}", "{{ .TokenHash }}"]);
const IS_LOCAL = !process.env.CI;
const IS_WRITE_RUN = process.env.EMAIL_WRITE === "1" && IS_LOCAL;
const IS_PREVIEW_RUN = process.env.EMAIL_PREVIEW === "1" && IS_LOCAL;
const OFFICE = { phoneDisplay: "(336) 708-0560", email: "charlie@charliewardrealty.com" };
const HOSTILE_TEXT = `<script>alert(1)</script> "quoted" & <a href="https://phish.example">click</a>\r\nBcc: attacker@example.com`;
const LONG_TEXT = Array.from({ length: 40 }, (_, index) => `Paragraph ${index + 1} of a long message about the house on Elm Street.`).join("\n\n");

function getCommittedTemplate(fileName: string): string {
  return readFileSync(path.join(TEMPLATE_DIR, fileName), "utf8");
}

function getHrefFreeHtml(html: string): string {
  return html.replace(/href="[^"]*"/g, "");
}

function getRequestSummary(contactName: string, message: string) {
  return { threadUrl: `${SITE_URL}/admin/inbox/sample`, source: "contact", contactName, contactEmail: "jordan@example.com", contactPhone: "(336) 555-0100", subject: "Contact form", message };
}

function getPreviewEmails(): Record<string, string> {
  const problemGroups = [{ section: "Homework", label: "Save an uploaded Homework file", severity: "critical" as const, count: 3, last_seen_at: "2026-09-27T20:00:00Z", reference: "CWR-AAA-BBB" }];
  const authEmails = Object.fromEntries(getAuthEmailTemplates().map(({ fileName, html }) => [`sign-in-${fileName}`, html]));
  return {
    ...authEmails,
    "new-request.html": getNewRequestAlert(getRequestSummary("Jordan Smith", "Hi, we'd like to list our house this spring.\n\nWhen can we talk?"), "desk@example.com").html,
    "new-request-hostile.html": getNewRequestAlert(getRequestSummary(HOSTILE_TEXT, HOSTILE_TEXT), "desk@example.com").html,
    "visitor-copy.html": getVisitorCopy({ name: "Jordan Smith", email: "jordan@example.com", office: OFFICE }).html,
    "reply.html": getReplyEmail({ name: "Jordan Smith", email: "jordan@example.com", reply: "Thanks, Jordan.\n\nFriday at 10 works. See you then.", office: OFFICE }).html,
    "reply-long.html": getReplyEmail({ name: "Jordan Smith", email: "jordan@example.com", reply: LONG_TEXT, office: OFFICE }).html,
    "test-alert.html": getTestAlert("desk@example.com").html,
    "problem-digest.html": getProblemDigest({ groups: problemGroups, recipient: "owner@example.com", adminUrl: `${SITE_URL}/admin` }).html,
  };
}

// Runs first so a write run leaves the drift checks below passing.
describe("email files on request", () => {
  it.runIf(IS_WRITE_RUN)("rewrites supabase/templates", () => {
    // Act
    getAuthEmailTemplates().forEach(({ fileName, html }) => writeFileSync(path.join(TEMPLATE_DIR, fileName), html));

    // Assert
    expect(getCommittedTemplate("invite.html")).toContain("cwr-card");
  });

  it.runIf(IS_PREVIEW_RUN)("writes a preview of every email", () => {
    // Arrange
    mkdirSync(PREVIEW_DIR, { recursive: true });

    // Act
    Object.entries(getPreviewEmails()).forEach(([fileName, html]) => writeFileSync(path.join(PREVIEW_DIR, fileName), html));

    // Assert
    expect(readFileSync(path.join(PREVIEW_DIR, "reply-long.html"), "utf8")).toContain("Paragraph 40");
  });
});

describe("Supabase sign-in templates", () => {
  it.each(getAuthEmailTemplates())("$fileName matches its generated version (run npm run email:templates)", ({ fileName, html }) => {
    // Act
    const committed = getCommittedTemplate(fileName);

    // Assert
    expect(committed).toBe(html);
  });

  it.each([
    ["invite.html", "invite"],
    ["recovery.html", "recovery"],
  ])("%s keeps the exact sign-in link", (fileName, type) => {
    // Arrange
    const html = getCommittedTemplate(fileName);

    // Act
    const hasLink = html.includes(`href="{{ .SiteURL }}/admin/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}"`);

    // Assert
    expect(hasLink).toBe(true);
  });

  it.each(getAuthEmailTemplates())("$fileName has no HTML comments (Supabase strips them)", ({ html }) => {
    // Assert
    expect(html).not.toContain("<!--");
  });

  it.each(getAuthEmailTemplates())("$fileName uses only the two Supabase link variables", ({ html }) => {
    // Act
    const variables = html.match(/\{\{[^}]*\}\}/g) ?? [];

    // Assert
    expect(variables.filter((variable) => !ALLOWED_GO_VARIABLES.has(variable))).toEqual([]);
  });

  it.each(getAuthEmailTemplates())("$fileName uses Supabase variables only inside links", ({ html }) => {
    // Assert
    expect(getHrefFreeHtml(html)).not.toContain("{{");
  });
});
