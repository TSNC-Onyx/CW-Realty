import { expect, test } from "@playwright/test";

// Features §4: the privacy policy lists every tracker and the chat's data use. With no Tag
// Manager set up (the default), no banner shows and "Cookie settings" opens that section.

test("the privacy policy names every tracker, storage key, and the chat's AI provider", async ({ page }) => {
  // Arrange / Act
  await page.goto("/privacy-policy");

  // Assert
  const policy = page.getByRole("main");
  for (const text of ["Anthropic", "cwr-chat", "cwr_consent", "cwr-attribution", "Google Analytics", "Google Ads", "Meta Pixel", "Cloudflare Turnstile", "Global Privacy Control", "one year after its last message"]) {
    await expect(policy).toContainText(text);
  }
});

test("without trackers set up there is no cookie banner", async ({ page }) => {
  // Arrange / Act
  await page.goto("/");

  // Assert
  await expect(page.getByRole("region", { name: "Cookie choices" })).toHaveCount(0);
});

test("without trackers set up, Cookie settings opens the privacy policy's cookie section", async ({ page }) => {
  // Arrange
  await page.goto("/about");

  // Act
  await page.getByRole("contentinfo").getByRole("link", { name: "Cookie settings" }).click();

  // Assert
  await expect(page).toHaveURL(/\/privacy-policy#cookies$/);
});
