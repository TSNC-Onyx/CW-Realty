import { expect, test } from "@playwright/test";

import { HAS_ADMIN_DATABASE, addOldSignInCode, createTestAdmin, fetchResetLink, signInFully, signInWithPassword, waitForBotCheck } from "./admin-helpers";

// Sign-in with email and password only (owner choice 2026-10-09, docs/cwr-password-only-sign-in-plan.md).

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

test("an owner signs in with email and password and lands on the dashboard", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("owner");

  // Act
  await signInWithPassword(page, admin);

  // Assert
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Users & roles/ }).first()).toBeVisible();
});

test("signing in returns people to the page they asked for", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("manager");
  await page.goto("/admin/listings");

  // Act
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await waitForBotCheck(page);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Assert
  await expect(page).toHaveURL(/\/admin\/listings$/);
});

test("an account set up with an authenticator before the change signs in without a code", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("owner");
  await addOldSignInCode(admin);

  // Act
  await signInWithPassword(page, admin);

  // Assert
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
});

test("the old code pages forward signed-in people to where they were going", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("owner"));

  // Act
  const landings: string[] = [];
  for (const path of ["/admin/mfa", "/admin/mfa/setup?next=%2Fadmin%2Fteam"]) {
    await page.goto(path);
    landings.push(new URL(page.url()).pathname);
  }

  // Assert
  expect(landings).toEqual(["/admin", "/admin/team"]);
});

test("a reset link lets someone choose an 8-character password and go straight in", async ({ page, baseURL }) => {
  // Arrange
  const admin = await createTestAdmin("manager");
  const newPassword = "Short1Ab";
  await page.goto(await fetchResetLink({ email: admin.email, baseUrl: baseURL ?? "" }));
  await expect(page.getByRole("heading", { level: 1, name: "Choose a password" })).toBeVisible();
  await expect(page.getByText("At least 8 characters, with a lowercase letter, an uppercase letter, and a number.")).toBeVisible();

  // Act
  await page.getByLabel("New password").fill(newPassword);
  await page.getByLabel("Type it again").fill(newPassword);
  await page.getByRole("button", { name: "Save password" }).click();

  // Assert
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await signInFully(page, { ...admin, password: newPassword });
});

test("a 7-character password is refused with a plain reason", async ({ page, baseURL }) => {
  // Arrange
  const admin = await createTestAdmin("manager");
  await page.goto(await fetchResetLink({ email: admin.email, baseUrl: baseURL ?? "" }));

  // Act
  await page.getByLabel("New password").fill("Short1A");
  await page.getByLabel("Type it again").fill("Short1A");
  await page.getByRole("button", { name: "Save password" }).click();

  // Assert
  await expect(page.getByText("Use at least 8 characters")).toBeVisible();
});

test("Users & roles no longer shows sign-in codes", async ({ page }) => {
  // Arrange
  await signInFully(page, await createTestAdmin("owner"));

  // Act
  await page.goto("/admin/users");

  // Assert
  await expect(page.getByText("Everyone signs in with their email and a password.")).toBeVisible();
  await expect(page.getByText(/sign-in codes?/i)).toHaveCount(0);
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
