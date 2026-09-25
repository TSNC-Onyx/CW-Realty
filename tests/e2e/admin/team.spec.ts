import path from "node:path";

import { expect, test } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully } from "./admin-helpers";

// Team editor (Admin §3) end to end, including an in-browser photo conversion and upload.

const TEST_PHOTO = path.join(__dirname, "..", "..", "fixtures", "test-house.jpg");
const PHOTO_TIMEOUT_MS = 90_000;

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

test("a manager adds a team member with a photo and the public page shows it", async ({ page }) => {
  // Arrange
  test.setTimeout(PHOTO_TIMEOUT_MS + 30_000);
  const admin = await createTestAdmin("manager");
  const name = `Test Person ${Date.now()}`;
  await signInFully(page, admin);
  await page.goto("/admin/team/new");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Title (optional)").fill("Broker");
  await page.getByRole("button", { name: "Add team member" }).click();
  await expect(page.getByText("Team member added")).toBeVisible();

  // Act
  await page.getByLabel("Choose a photo").setInputFiles(TEST_PHOTO);
  await page.getByLabel("Describe the photo").fill("Portrait of a test person");
  await page.getByRole("button", { name: "Add photo" }).click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: "Photo saved." })).toBeVisible({ timeout: PHOTO_TIMEOUT_MS });
  const slug = name.toLowerCase().replace(/ /g, "-");
  await page.goto(`/team/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByRole("img", { name: "Portrait of a test person" })).toBeVisible();
});

test("hiding a member can be undone from the message", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("owner");
  await signInFully(page, admin);
  await page.goto("/admin/team/new");
  const name = `Undo Person ${Date.now()}`;
  await page.getByLabel("Full name").fill(name);
  await page.getByRole("button", { name: "Add team member" }).click();
  await expect(page.getByText("Team member added")).toBeVisible();
  await page.goto("/admin/team");

  // Act
  await page.getByRole("button", { name: `Hide ${name}` }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();

  // Assert
  await expect(page.getByRole("button", { name: `Hide ${name}` })).toBeVisible();
});

test("a web address already in use is explained beside the field", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("manager");
  await signInFully(page, admin);
  const name = `Twin Person ${Date.now()}`;
  for (const attempt of [1, 2]) {
    await page.goto("/admin/team/new");
    await page.getByLabel("Full name").fill(name);

    // Act
    await page.getByRole("button", { name: "Add team member" }).click();
    if (attempt === 1) await expect(page.getByText("Team member added")).toBeVisible();
  }

  // Assert
  await expect(page.getByText("Another team member already uses this web address").first()).toBeVisible();
});

test("removing an imported portrait can be undone", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("manager");
  await signInFully(page, admin);
  await page.goto("/admin/team");
  await page.getByRole("link", { name: /Edit Charlie Ward/ }).click();

  // Act
  await page.getByRole("button", { name: "Remove Charlie Ward Sr.'s photo" }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: "Photo saved." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Charlie Ward Sr.'s photo" })).toBeVisible();
});
