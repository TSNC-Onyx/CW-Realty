import { expect, test } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully } from "./admin-helpers";

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

test("contact details check the phone format before saving", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("manager");
  await signInFully(page, admin);
  await page.goto("/admin/contact");

  // Act
  await page.getByLabel("Main phone").fill("555");
  await page.getByRole("button", { name: "Save changes" }).click();

  // Assert
  await expect(page.getByText("Enter a 10-digit US phone number, like (336) 555-0123")).toBeVisible();
});

test("an extra footer line saves and appears on every page", async ({ page }) => {
  // Arrange
  const admin = await createTestAdmin("owner");
  const footerLine = `Test footer ${Date.now()}`;
  await signInFully(page, admin);
  await page.goto("/admin/contact");

  // Act
  await page.getByLabel("Extra footer line (optional)").fill(footerLine);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Contact details saved" })).toBeVisible();

  // Assert
  await page.goto("/about");
  await expect(page.getByText(footerLine)).toBeVisible();
  await page.goto("/admin/contact");
  await page.getByLabel("Extra footer line (optional)").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Contact details saved" })).toBeVisible();
});

test("only owners can delete forever; managers can restore", async ({ page }) => {
  // Arrange
  const manager = await createTestAdmin("manager");
  await signInFully(page, manager);
  const name = `Trash Person ${Date.now()}`;
  await page.goto("/admin/team/new");
  await page.getByLabel("Full name").fill(name);
  await page.getByRole("button", { name: "Add team member" }).click();
  await expect(page.getByText("Team member added")).toBeVisible();
  await page.goto("/admin/team");
  await page.getByRole("button", { name: `Move ${name} to trash` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Moved to trash" })).toBeVisible();

  // Act
  await page.goto("/admin/trash");

  // Assert
  await expect(page.getByRole("button", { name: `Restore ${name}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Delete ${name} forever` })).toHaveCount(0);
});

test("an owner invites a manager, and the new person appears with that role and name", async ({ page }) => {
  // Arrange
  const owner = await createTestAdmin("owner");
  const inviteEmail = `invited-${Date.now()}@test.cwr`;
  await signInFully(page, owner);
  await page.goto("/admin/users");

  // Act
  await page.getByLabel("First name").fill("Invited");
  await page.getByLabel("Last name").fill("Person");
  await page.getByLabel("Email").fill(inviteEmail);
  await page.getByLabel("Role").first().selectOption("manager");
  await page.getByRole("button", { name: "Send invite" }).click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: `Invite sent to ${inviteEmail}` })).toBeVisible();
  const row = page.getByRole("region", { name: "People with access" }).getByRole("listitem").filter({ hasText: inviteEmail });
  await expect(row.getByText("Invited Person", { exact: true })).toBeVisible();
});

test("an invite with no name is refused, and the field says why", async ({ page }) => {
  // Arrange
  const owner = await createTestAdmin("owner");
  await signInFully(page, owner);
  await page.goto("/admin/users");

  // Act
  await page.getByLabel("Last name").fill("Person");
  await page.getByLabel("Email").fill(`unnamed-${Date.now()}@test.cwr`);
  await page.getByRole("button", { name: "Send invite" }).click();

  // Assert
  await expect(page.getByText("Enter a first name of up to 100 characters.")).toBeVisible();
});

test("an owner corrects another person's name", async ({ page }) => {
  // Arrange
  const owner = await createTestAdmin("owner");
  const manager = await createTestAdmin("manager");
  await signInFully(page, owner);
  await page.goto("/admin/users");
  const row = page.getByRole("region", { name: "People with access" }).getByRole("listitem").filter({ hasText: manager.email });

  // Act
  await row.getByRole("button", { name: `Add name for ${manager.email}` }).click();
  await row.getByLabel("First name").fill("Morgan");
  await row.getByLabel("Last name").fill("Hale");
  await row.getByRole("button", { name: `Save the name for ${manager.email}` }).click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: "Name saved." })).toBeVisible();
  await expect(row.getByText("Morgan Hale", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: `Edit name for ${manager.email}` })).toBeVisible();
});

test("an owner corrects their own name", async ({ page }) => {
  // Arrange
  const owner = await createTestAdmin("owner");
  await signInFully(page, owner);
  await page.goto("/admin/users");
  const row = page.getByRole("region", { name: "People with access" }).getByRole("listitem").filter({ hasText: owner.email });

  // Act
  await row.getByRole("button", { name: `Add name for ${owner.email}` }).click();
  await row.getByLabel("First name").fill("Avery");
  await row.getByLabel("Last name").fill("Owner");
  await row.getByRole("button", { name: `Save the name for ${owner.email}` }).click();

  // Assert
  await expect(row.getByText("Avery Owner", { exact: true })).toBeVisible();
});

test("managers cannot open Users & roles", async ({ page }) => {
  // Arrange
  const manager = await createTestAdmin("manager");
  await signInFully(page, manager);

  // Act
  await page.goto("/admin/users");

  // Assert
  await expect(page).toHaveURL(/\/admin\?notice=role/);
});
