import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";


// The owner's live-site script, tested here so its 33 settings can't drift from the repo.
import { getChangedKeys, getDesiredEmailSettings, getEmailSettingKeys, getHookSettings, NOTIFICATION_TYPES, TEMPLATE_TYPES } from "../../../scripts/push-auth-email-templates.mjs";
import { getAuthEmailTemplates, getNewRequestAlert, getProblemDigest, getReplyEmail, getTestAlert, getVisitorCopy } from "./templates.ts";
import { SITE_URL } from "./site-values.ts";

// Keeps supabase/templates/*.html (Supabase's fallback) equal to templates.ts, and (on request,
// never in CI) rewrites those files or writes a local preview of every email.
//   npm run email:templates   → EMAIL_WRITE=1
//   npm run email:preview     → EMAIL_PREVIEW=1, files land in email-preview/

const TEMPLATE_DIR = "supabase/templates";
const PREVIEW_DIR = "email-preview";
const CONFIG_FILE = "supabase/config.toml";
const NOTICES_ON = ["password_changed", "email_changed", "mfa_factor_enrolled", "mfa_factor_unenrolled"];
const NO_LINK_TYPES = ["confirmation", "magic_link", "email_change", "reauthentication"];
const ONE_TIME_VALUES = ["{{ .TokenHash }}", "{{ .Token }}", "{{ .ConfirmationURL }}"];
// Phrases from Supabase's own default emails; none may appear in ours.
const SUPABASE_DEFAULT_PHRASES = ["Follow this link", "Confirm your signup", "Magic Link", "Enter the code"];
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

function getConfigToml(): string {
  return readFileSync(CONFIG_FILE, "utf8");
}

function getDesiredSettings(): Record<string, string | boolean> {
  return getDesiredEmailSettings({ toml: getConfigToml(), readTemplate: (filePath: string) => readFileSync(filePath, "utf8") });
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

  it.each(getAuthEmailTemplates())("$fileName uses only the Supabase values it is given", ({ html, allowedVariables }) => {
    // Act
    const variables = html.match(/\{\{[^}]*\}\}/g) ?? [];

    // Assert
    expect(variables.filter((variable) => !allowedVariables.includes(variable))).toEqual([]);
  });

  it.each(getAuthEmailTemplates())("$fileName puts Supabase values only in links and text, never in other attributes", ({ html }) => {
    // Assert
    expect(getHrefFreeHtml(html)).not.toMatch(/<[^>]*\{\{/);
  });

  it.each(getAuthEmailTemplates())("$fileName has none of Supabase's default wording", ({ html }) => {
    // Assert
    expect(SUPABASE_DEFAULT_PHRASES.filter((phrase) => html.includes(phrase))).toEqual([]);
  });

  it.each(NO_LINK_TYPES)("%s has no working link or code (the site doesn't offer it)", (type) => {
    // Arrange
    const template = getAuthEmailTemplates().find((candidate) => candidate.type === type);

    // Assert
    expect(ONE_TIME_VALUES.filter((value) => template?.html.includes(value))).toEqual([]);
  });

  it("covers every email Supabase Auth can send", () => {
    // Act
    const types = getAuthEmailTemplates().map(({ type }) => type);

    // Assert
    expect(types.sort()).toEqual([...TEMPLATE_TYPES, ...NOTIFICATION_TYPES].sort());
  });
});

describe("Supabase email settings", () => {
  it.each(getAuthEmailTemplates())("config.toml uses $fileName with the same subject", ({ type, kind, fileName, subject }) => {
    // Arrange
    const section = kind === "template" ? `auth.email.template.${type}` : `auth.email.notification.${type}`;

    // Act
    const hasSection = getConfigToml().includes(`[${section}]\n${kind === "notification" ? "enabled = " : ""}`);
    const hasFile = getConfigToml().includes(`subject = "${subject}"\ncontent_path = "./supabase/templates/${fileName}"`);

    // Assert
    expect([hasSection, hasFile]).toEqual([true, true]);
  });

  it("switches on only the password, email, and sign-in-code notices", () => {
    // Act
    const settings = getDesiredSettings();
    const enabled = NOTIFICATION_TYPES.filter((type: string) => settings[`mailer_notifications_${type}_enabled`] === true);

    // Assert
    expect(enabled.sort()).toEqual([...NOTICES_ON].sort());
  });

  it("the live-site script changes exactly the 33 email settings", () => {
    // Act
    const keys = Object.keys(getDesiredSettings());

    // Assert
    expect([keys.length, keys.sort()]).toEqual([33, [...getEmailSettingKeys()].sort()]);
  });

  it("the live-site script sends each email's own file", () => {
    // Act
    const settings = getDesiredSettings();

    // Assert
    expect(getAuthEmailTemplates().every(({ type, kind, html }) => settings[kind === "template" ? `mailer_templates_${type}_content` : `mailer_templates_${type}_notification_content`] === html)).toBe(true);
  });

  it("the live-site script sends each email's own subject", () => {
    // Act
    const settings = getDesiredSettings();

    // Assert
    expect(getAuthEmailTemplates().every(({ type, kind, subject }) => settings[kind === "template" ? `mailer_subjects_${type}` : `mailer_subjects_${type}_notification`] === subject)).toBe(true);
  });

  it("a restore changes only the settings in the backup", () => {
    // Arrange
    const backup = { mailer_subjects_invite: "Old subject", site_url: "https://example.com" };

    // Act
    const changedKeys = getChangedKeys({ mailer_subjects_invite: "New subject", site_url: "https://other.example" }, backup);

    // Assert
    expect(changedKeys).toEqual(["mailer_subjects_invite"]);
  });

  it("turning the hook on hands every email to the outbox's database function", () => {
    // Act
    const settings = getHookSettings(true);

    // Assert
    expect(settings).toEqual({ hook_send_email_enabled: true, hook_send_email_uri: "pg-functions://postgres/cwr/handle_auth_email" });
  });

  it("the hook switch changes only the hook settings", () => {
    // Arrange
    const current = { hook_send_email_enabled: true, hook_send_email_uri: "pg-functions://postgres/cwr/handle_auth_email", site_url: "https://www.charliewardrealty.com" };

    // Act
    const changedKeys = getChangedKeys(current, getHookSettings(false));

    // Assert
    expect(changedKeys).toEqual(["hook_send_email_enabled"]);
  });

  it("the hook uses the same database function as local Supabase", () => {
    // Assert
    expect(getConfigToml()).toContain(`[auth.hook.send_email]\nenabled = true\nuri = "${getHookSettings(true).hook_send_email_uri}"`);
  });
});
