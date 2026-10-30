import { expect, test, type Page } from "@playwright/test";

import { waitForBotCheck } from "./admin/admin-helpers";
import { VIEWPORTS } from "./pages";

const TURNSTILE_SCRIPT = "**/challenges.cloudflare.com/turnstile/**";
const TURNSTILE_CONTAINER = 'div[id^="cf-turnstile-"]';

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

  test("a complete message reaches the office and thanks the visitor by name", async ({ page }) => {
    // Arrange
    test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "Needs the local database");
    await page.getByLabel("Full name").fill("Jordan Smith");
    await page.getByLabel("Email").fill("jordan@example.com");
    await page.getByLabel("How can we help?").fill("I'd like a showing.");
    await waitForBotCheck(page);

    // Act
    await page.getByRole("button", { name: "Send message" }).click();

    // Assert
    await expect(page.getByRole("heading", { name: "Thanks, Jordan. Your message is in." })).toBeFocused();
    // The form can't know whether a copy will be emailed, so it makes no claim (owner decision D3, 2026-10-29).
    await expect(page.getByText(/We sent a copy/)).toHaveCount(0);
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

// The Quick Check's own container style is allowed by the security policy, and its 300px
// minimum is cancelled so the layout stays as it was (docs/visitor-audit-fixes-plan.md R9, D4).
test.describe("Quick Check container", () => {
  test.skip(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "Needs the test site key");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const directives: string[] = [];
      Object.assign(window, { styleViolations: directives });
      document.addEventListener("securitypolicyviolation", (event) => {
        if (event.violatedDirective.startsWith("style-src")) directives.push(event.violatedDirective);
      });
    });
  });

  /** Style-policy violations seen so far, whether the page scrolls sideways, and whether the container overflows its form. */
  async function getContainerFit(page: Page) {
    const container = page.locator(TURNSTILE_CONTAINER).first();
    await expect(container).toBeAttached();
    return container.evaluate((element) => ({
      styleViolations: (window as unknown as { styleViolations: string[] }).styleViolations,
      hasSidewaysScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth > 0,
      // Measured against the form: the container's own grid parent stretches to fit it.
      isWiderThanColumn: element.getBoundingClientRect().width > (element.closest("form")?.getBoundingClientRect().width ?? 0),
    }));
  }

  for (const [viewportName, viewport] of Object.entries({ smallPhone: VIEWPORTS.smallPhone, phone: VIEWPORTS.phone, desktop: VIEWPORTS.desktop })) {
    test(`on first load the container breaks no style rule and fits the ${viewportName} column`, async ({ page }) => {
      // Arrange
      await page.setViewportSize(viewport);

      // Act
      await page.goto("/contact");
      await waitForBotCheck(page);

      // Assert
      expect(await getContainerFit(page)).toEqual({ styleViolations: [], hasSidewaysScroll: false, isWiderThanColumn: false });
    });

    test(`after Try again rebuilds the check, the container still fits the ${viewportName} column`, async ({ page }) => {
      // Arrange
      await page.setViewportSize(viewport);
      await page.route(TURNSTILE_SCRIPT, (route) => route.abort("blockedbyclient"));
      await page.goto("/contact");
      await page.getByRole("button", { name: "Try again" }).click({ timeout: 15_000 });

      // Act
      const fit = await getContainerFit(page);

      // Assert
      expect(fit).toEqual({ styleViolations: [], hasSidewaysScroll: false, isWiderThanColumn: false });
    });
  }
});
