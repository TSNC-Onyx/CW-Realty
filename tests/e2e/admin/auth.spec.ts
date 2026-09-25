import { expect, test } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully, signInWithPassword } from "./admin-helpers";

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

test("signed-out visitors are sent to sign in", async ({ page }) => {
  // Arrange
  const path = "/admin/listings";

  // Act
  await page.goto(path);

  // Assert
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Flistings/);
});

test("a wrong password gets a plain message and keeps the email", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("owner");

  // Act
  await signInWithPassword(page, { ...admin, password: "Wrong-password-123" });

  // Assert
  await expect(page.getByRole("main").getByRole("alert")).toContainText("don't match an account");
  await expect(page.getByLabel("Email")).toHaveValue(admin.email);
});

test("an owner sets up sign-in codes on first sign-in and reaches the dashboard", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("owner");

  // Act
  await signInFully(page, admin);

  // Assert
  await expect(page.getByRole("link", { name: /Users & roles/ }).first()).toBeVisible();
});

test("a password alone never opens the portal", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("owner");
  await signInFully(page, admin);
  await page.getByRole("button", { name: "Sign out" }).click();
  await signInWithPassword(page, admin);
  await expect(page).toHaveURL(/\/admin\/mfa/);

  // Act
  await page.goto("/admin");

  // Assert
  await expect(page).toHaveURL(/\/admin\/mfa/);
});

test("staff do not see editing areas and are turned back from them", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("staff");
  await signInFully(page, admin);

  // Act
  await page.goto("/admin/listings");

  // Assert
  await expect(page).toHaveURL(/\/admin\?notice=role/);
  await expect(page.getByRole("link", { name: "Listings" })).toHaveCount(0);
});

test("an account without a CWR role is signed out with an explanation", async ({ page }) => {
  // Arrange
  const outsider = await createTestAdmin(null);

  // Act
  await signInFully(page, outsider).catch(() => undefined);

  // Assert
  await expect(page.getByText("This account doesn't have access")).toBeVisible();
});

test("a session idle for more than 30 minutes ends on the next request", async ({ page, context }) => {
  // Arrange
  const admin = await createTestAdmin("manager");
  await signInFully(page, admin);
  const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
  await context.addCookies([{ name: "cwr-admin-activity", value: String(thirtyOneMinutesAgo), url: new URL("/admin", page.url()).toString() }]);

  // Act
  await page.goto("/admin");

  // Assert
  await expect(page).toHaveURL(/\/admin\/login\?reason=timeout/);
});
