import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { HAS_ADMIN_DATABASE, waitForBotCheck } from "./admin/admin-helpers";
import { VIEWPORTS } from "./pages";

// Phase 5 chat widget (Features §2, Style §11.13). CI has no Anthropic key, so questions
// get the "a person can help" reply; the answer path is covered by unit tests.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function openChatOnDesktop(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/about");
  await page.getByRole("button", { name: "Chat with us" }).click();
  await expect(page.getByRole("dialog", { name: "CWR Assistant" })).toBeVisible();
}

test("the desktop launcher opens a chat clearly labeled as AI", async ({ page }) => {
  // Arrange / Act
  await openChatOnDesktop(page);

  // Assert
  const panel = page.getByRole("dialog", { name: "CWR Assistant" });
  await expect(panel.getByText("AI · NOT A PERSON")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Talk to a person" })).toBeVisible();
  await expect(panel.getByLabel("Your question")).toBeFocused();
});

test("Escape closes the chat and returns focus to the launcher", async ({ page }) => {
  // Arrange
  await openChatOnDesktop(page);

  // Act
  await page.keyboard.press("Escape");

  // Assert
  await expect(page.getByRole("dialog", { name: "CWR Assistant" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Chat with us" })).toBeFocused();
});

test("the phone action bar's Chat button opens the chat full screen", async ({ page }) => {
  // Arrange
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto("/about");

  // Act
  await page.getByRole("navigation", { name: "Quick contact" }).getByRole("link", { name: "Chat" }).click();

  // Assert
  const panel = page.getByRole("dialog", { name: "CWR Assistant" });
  await expect(panel).toBeVisible();
  expect((await panel.boundingBox())?.width).toBe(VIEWPORTS.phone.width);
});

test("on a phone, Tab stays inside the full-screen chat", async ({ page }) => {
  // Arrange
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto("/about");
  await page.getByRole("navigation", { name: "Quick contact" }).getByRole("link", { name: "Chat" }).click();
  const panel = page.getByRole("dialog", { name: "CWR Assistant" });
  await expect(panel.getByLabel("Your question")).toBeFocused();

  // Act
  for (let press = 0; press < 6; press += 1) await page.keyboard.press("Tab");

  // Assert
  expect(await panel.evaluate((element) => element.contains(document.activeElement))).toBe(true);
});

// Bug 19 (docs/cwr-chatbot-round-3-plan.md): with the chat open on a phone, scrolling moves the
// chat, never the page behind it. The real iPhone keyboard check is manual (emulators have no
// iOS keyboard); these cover the lock, the scroll position, desktop, and leaving the page.
const PAGE_SCROLL_Y = 600;

async function openChatOnPhoneAfterScrolling(page: Page): Promise<number> {
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto("/about");
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), PAGE_SCROLL_Y);
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.getByRole("navigation", { name: "Quick contact" }).getByRole("link", { name: "Chat" }).click();
  await expect(page.getByRole("dialog", { name: "CWR Assistant" })).toBeVisible();
  return scrollY;
}

test("on a phone, scrolling over the open chat never scrolls the page behind it", async ({ page }) => {
  // Arrange
  const scrollY = await openChatOnPhoneAfterScrolling(page);
  const box = await page.getByLabel("Your question").boundingBox();

  // Act
  await page.mouse.move((box?.x ?? 0) + 20, (box?.y ?? 0) + 10);
  await page.mouse.wheel(0, 900);
  await page.mouse.move(VIEWPORTS.phone.width / 2, 200);
  await page.mouse.wheel(0, 900);

  // Assert
  expect({ scrollY: await page.evaluate(() => window.scrollY), overflow: await page.evaluate(() => getComputedStyle(document.documentElement).overflow) }).toEqual({ scrollY, overflow: "hidden" });
});

test("on a phone, the open chat is a modal dialog", async ({ page }) => {
  // Arrange / Act
  await openChatOnPhoneAfterScrolling(page);

  // Assert
  await expect(page.getByRole("dialog", { name: "CWR Assistant" })).toHaveAttribute("aria-modal", "true");
});

test("on a phone, closing the chat leaves the page where it was and lets it scroll again", async ({ page }) => {
  // Arrange
  const scrollY = await openChatOnPhoneAfterScrolling(page);

  // Act
  await page.getByRole("button", { name: "Close chat" }).click();

  // Assert
  expect({ scrollY: await page.evaluate(() => window.scrollY), overflow: await page.evaluate(() => getComputedStyle(document.documentElement).overflow) }).toEqual({ scrollY, overflow: "visible" });
});

test("on a phone, the chat follows the visible area above the keyboard", async ({ page }) => {
  // Arrange
  await openChatOnPhoneAfterScrolling(page);
  const panel = page.getByRole("dialog", { name: "CWR Assistant" });

  // Act
  await panel.evaluate((element) => {
    (element as HTMLElement).style.setProperty("--chat-viewport-height", "400px");
    (element as HTMLElement).style.setProperty("--chat-viewport-top", "50px");
  });

  // Assert
  expect(await panel.evaluate((element) => ({ top: getComputedStyle(element).top, height: getComputedStyle(element).height }))).toEqual({ top: "50px", height: "400px" });
});

test("on a phone, going back to the previous page closes the chat and unlocks scrolling", async ({ page }) => {
  // Arrange
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto("/team");
  await page.getByRole("contentinfo").getByRole("link", { name: "About us" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await page.getByRole("navigation", { name: "Quick contact" }).getByRole("link", { name: "Chat" }).click();
  await expect(page.getByRole("dialog", { name: "CWR Assistant" })).toBeVisible();

  // Act
  await page.goBack();

  // Assert
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByRole("dialog", { name: "CWR Assistant" })).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("visible");
});

test("resizing from phone to desktop with the chat open unlocks the page and drops the modal", async ({ page }) => {
  // Arrange
  await openChatOnPhoneAfterScrolling(page);

  // Act
  await page.setViewportSize(VIEWPORTS.desktop);

  // Assert
  const panel = page.getByRole("dialog", { name: "CWR Assistant" });
  await expect(panel).not.toHaveAttribute("aria-modal", "true");
  expect({ overflow: await page.evaluate(() => getComputedStyle(document.documentElement).overflow), height: await panel.evaluate((element) => (element as HTMLElement).style.getPropertyValue("--chat-viewport-height")) }).toEqual({ overflow: "visible", height: "" });
});

test("the phone menu still locks and unlocks the page as before", async ({ page }) => {
  // Arrange
  await page.setViewportSize(VIEWPORTS.phone);
  await page.goto("/about");

  // Act
  await page.getByRole("link", { name: "Menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  const overflowOpen = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();

  // Assert
  expect({ overflowOpen, overflowClosed: await page.evaluate(() => getComputedStyle(document.documentElement).overflow) }).toEqual({ overflowOpen: "hidden", overflowClosed: "visible" });
});

test("on desktop, the page still scrolls with the chat open", async ({ page }) => {
  // Arrange
  await openChatOnDesktop(page);

  // Act
  await page.mouse.move(200, 500);
  await page.mouse.wheel(0, 600);

  // Assert
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("the open chat has no WCAG 2.2 AA violations", async ({ page }) => {
  // Arrange
  await openChatOnDesktop(page);

  // Act
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(WCAG_TAGS).analyze();

  // Assert
  expect(results.violations).toEqual([]);
});

test("the page loads without the chat panel's code until the visitor opens it", async ({ page }) => {
  // Arrange
  const panelScripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script" && request.url().includes("challenges.cloudflare.com")) panelScripts.push(request.url());
  });

  // Act
  await page.goto("/about");
  await page.waitForLoadState("networkidle");

  // Assert
  expect(panelScripts).toEqual([]);
});

test.describe("with the local database", () => {
  test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

  test("without a connected assistant, a question is answered with an offer of a person", async ({ page }) => {
    // Arrange
    await openChatOnDesktop(page);
    await page.getByLabel("Your question").fill("How do I book a TouchUp?");
    await waitForBotCheck(page);

    // Act
    await page.getByRole("button", { name: "Send" }).click();

    // Assert
    const log = page.getByRole("log", { name: "Chat messages" });
    await expect(log.getByText("How do I book a TouchUp?")).toBeVisible();
    await expect(log.getByText(/can't answer questions right now/)).toBeVisible();
    await expect(page.getByLabel("Your question")).toHaveValue("");
  });

  test("the conversation survives a page load in the same tab", async ({ page }) => {
    // Arrange
    await openChatOnDesktop(page);
    await page.getByLabel("Your question").fill("Do you work in High Point?");
    await waitForBotCheck(page);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("log", { name: "Chat messages" }).getByText(/can't answer questions right now/)).toBeVisible();

    // Act
    await page.goto("/team");
    await page.getByRole("button", { name: "Chat with us" }).click();

    // Assert
    await expect(page.getByRole("log", { name: "Chat messages" }).getByText("Do you work in High Point?")).toBeVisible();
  });

  test("the hand-off form needs an email or a phone number", async ({ page }) => {
    // Arrange
    await openChatOnDesktop(page);
    await page.getByRole("button", { name: "Talk to a person" }).click();
    await page.getByLabel("Full name").fill("Jordan Smith");
    await page.getByLabel("What can we help with?").fill("Can I see 100 Main St?");
    await waitForBotCheck(page);

    // Act
    await page.getByRole("button", { name: "Send to our team" }).click();

    // Assert
    await expect(page.locator("#chat-handoff-email-error")).toHaveText("Enter an email or a phone number so we can reply");
  });

  test("talking to a person sends the question and says when to expect a reply", async ({ page }) => {
    // Arrange
    await openChatOnDesktop(page);
    await page.getByRole("button", { name: "Talk to a person" }).click();
    await page.getByLabel("Full name").fill("Jordan Smith");
    await page.getByLabel("Phone").fill("(336) 555-0123");
    await page.getByLabel("What can we help with?").fill("Can I see 100 Main St this weekend?");
    await waitForBotCheck(page);

    // Act
    await page.getByRole("button", { name: "Send to our team" }).click();

    // Assert
    await expect(page.getByRole("heading", { name: "Thanks, Jordan. A person will reply." })).toBeFocused();
    await expect(page.getByText("Someone from our team will get back to you within one business day.")).toBeVisible();
  });
});
