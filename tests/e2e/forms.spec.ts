import { expect, test } from "@playwright/test";

test.describe("contact form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contact");
  });

  test("sending an empty form lists each problem and moves focus to the list", async ({ page }) => {
    // Arrange
    const sendButton = page.getByRole("button", { name: "Send message" });

    // Act
    await sendButton.click();

    // Assert
    const summary = page.locator("#contact-form").getByRole("alert");
    await expect(summary).toBeFocused();
    await expect(summary).toContainText("Fix 3 things to send");
  });

  test("leaving a field with a bad email shows a specific message beside it", async ({ page }) => {
    // Arrange
    const email = page.getByLabel("Email");
    await email.fill("jordan@");

    // Act
    await email.blur();

    // Assert
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#contact-form-email-error")).toHaveText("Enter a full email address, like name@example.com");
  });

  test("a complete message keeps what was typed and says how to reach us for now", async ({ page }) => {
    // Arrange
    await page.getByLabel("Full name").fill("Jordan Smith");
    await page.getByLabel("Email").fill("jordan@example.com");
    await page.getByLabel("How can we help?").fill("I'd like a showing.");

    // Act
    await page.getByRole("button", { name: "Send message" }).click();

    // Assert
    await expect(page.getByRole("status").filter({ hasText: "Online requests open soon" })).toBeVisible();
    await expect(page.getByLabel("How can we help?")).toHaveValue("I'd like a showing.");
  });
});

test.describe("CWR TouchUp request form", () => {
  test("asks for a phone number so staff can confirm the visit", async ({ page }) => {
    // Arrange
    await page.goto("/services/cwr-touchup");

    // Act
    await page.getByRole("button", { name: "Request a TouchUp visit" }).click();

    // Assert
    await expect(page.locator("#touchup-request-form").getByRole("alert")).toContainText("Enter your phone number");
  });
});
