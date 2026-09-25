import { expect, test, type Page } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully, waitForBotCheck } from "./admin-helpers";

// Phase 4: public request → inbox → assign → note → reply; staff visibility; alerts.

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

async function sendContactRequest(page: Page, name: string): Promise<void> {
  await page.goto("/contact");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill("visitor@example.com");
  await page.getByLabel("How can we help?").fill("Please call me about 5423 Pine Level Dr.");
  await waitForBotCheck(page);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("heading", { name: /Your message is in/ })).toBeVisible();
}

test("a manager assigns, notes, and replies to a new request", async ({ page }) => {
  // Arrange
  const visitorName = `Visitor ${Date.now()}`;
  await sendContactRequest(page, visitorName);
  const manager = await createTestAdmin("manager");
  await signInFully(page, manager);
  await page.goto("/admin/inbox?status=new");
  await page.getByRole("link", { name: new RegExp(visitorName) }).click();

  // Act
  await page.getByRole("button", { name: "Assign this message" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Assigned." })).toBeVisible();
  await page.getByLabel("Note for your team").fill("Prefers mornings.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Note added." })).toBeVisible();
  await page.getByLabel("Your reply").fill("Thanks! I'll call you tomorrow morning.");
  await page.getByRole("button", { name: "Send reply" }).click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: "Reply sent." })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Team note — not sent")).toBeVisible();
  await expect(page.getByText("Reply sent by email")).toBeVisible();
  await expect(page.getByText("Replied", { exact: true }).first()).toBeVisible();
});

test("staff see only requests assigned to them", async ({ page }) => {
  // Arrange
  const visitorName = `Unassigned ${Date.now()}`;
  await sendContactRequest(page, visitorName);
  const staff = await createTestAdmin("staff");
  await signInFully(page, staff);

  // Act
  await page.goto("/admin/inbox?status=new");

  // Assert
  await expect(page.getByRole("link", { name: new RegExp(visitorName) })).toHaveCount(0);
  await expect(page.getByText("Messages assigned to you.")).toBeVisible();
});

test("the dashboard and menu show how many requests are waiting", async ({ page }) => {
  // Arrange
  await sendContactRequest(page, `Waiting ${Date.now()}`);
  const owner = await createTestAdmin("owner");

  // Act
  await signInFully(page, owner);

  // Assert
  await expect(page.getByRole("link", { name: /Inbox \(\d+ new\)/ }).first()).toBeVisible();
});

test("an editor adds an alert recipient and sends a test alert that shows in the log", async ({ page }) => {
  // Arrange
  const manager = await createTestAdmin("manager");
  const email = `alerts-${Date.now()}@example.com`;
  await signInFully(page, manager);
  await page.goto("/admin/notifications");
  await page.getByLabel("Name").fill("Front Desk");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Front Desk will get alerts." })).toBeVisible();

  // Act
  await page.getByRole("button", { name: "Send a test alert to everyone who gets alerts" }).click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: /Test (logged|alert sent)/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Recent emails" }).getByText(email).first()).toBeVisible();
});
