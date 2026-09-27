import path from "node:path";

import { expect, test } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully } from "./admin-helpers";

// Connections editor (owner approval 2026-09-26), including an in-browser photo upload.

const TEST_PHOTO = path.join(__dirname, "..", "..", "fixtures", "test-house.jpg");
const PHOTO_TIMEOUT_MS = 90_000;

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

test("a manager adds a connection with a photo and the Connections page shows it", async ({ page }) => {
  // Arrange
  test.setTimeout(PHOTO_TIMEOUT_MS + 30_000);
  const admin = await createTestAdmin("manager");
  const name = `Test Partner ${Date.now()}`;
  await signInFully(page, admin);
  await page.goto("/admin/connections/new");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Category").selectOption("Home warranty");
  await page.getByLabel("Phone (optional)").fill("336-555-0100");
  await page.getByRole("button", { name: "Add connection" }).click();
  await expect(page.getByText("Connection added")).toBeVisible();

  // Act
  await page.getByLabel("Choose a photo").setInputFiles(TEST_PHOTO);
  await page.getByLabel("Describe the photo").fill("Portrait of a test partner");
  await page.getByRole("button", { name: "Add photo" }).click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: "Photo saved." })).toBeVisible({ timeout: PHOTO_TIMEOUT_MS });
  await page.goto("/connections");
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3, name }) });
  await expect(card.getByRole("img", { name: "Portrait of a test partner" })).toBeVisible();
});

test("hiding a connection can be undone from the message", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("owner");
  await signInFully(page, admin);
  const name = `Undo Partner ${Date.now()}`;
  await page.goto("/admin/connections/new");
  await page.getByLabel("Full name").fill(name);
  await page.getByRole("button", { name: "Add connection" }).click();
  await expect(page.getByText("Connection added")).toBeVisible();
  await page.goto("/admin/connections");

  // Act
  await page.getByRole("button", { name: `Hide ${name}` }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();

  // Assert
  await expect(page.getByRole("button", { name: `Hide ${name}` })).toBeVisible();
});

test("a web address without https is explained beside the field", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("manager");
  await signInFully(page, admin);
  await page.goto("/admin/connections/new");
  await page.getByLabel("Full name").fill(`Site Partner ${Date.now()}`);
  await page.getByLabel("Website (optional)").fill("example.com");

  // Act
  await page.getByRole("button", { name: "Add connection" }).click();

  // Assert
  await expect(page.getByText("Enter a full web address starting with https://")).toBeVisible();
});
