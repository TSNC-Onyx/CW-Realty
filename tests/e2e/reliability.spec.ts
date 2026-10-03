import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { HAS_ADMIN_DATABASE, waitForBotCheck } from "./admin/admin-helpers";
import { VIEWPORTS } from "./pages";

// The reliability round (docs/cwr-reliability-round-plan.md, docs/cwr-stale-quick-check-addendum.md):
// the listing photo gallery, the Quick Check's held sends and recovery, out-of-date pages,
// a chat that can't freeze, and website visitors' problems in the log.

const LISTING_PATH = "/listings/5423-pine-level-dr-browns-summit-nc";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SERVER_ACTION_HEADER = "next-action";
const OLD_SITE_KEY = "1x00000000000000000000AB";
const TURNSTILE_SCRIPT = "**/challenges.cloudflare.com/turnstile/**";

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    db: { schema: "cwr" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchLatestProblem({ action, code, since }: { action: string; code: string; since: string }) {
  const { data, error } = await getServiceClient()
    .from("problem_events")
    .select("action, origin, severity, code, shown_message, detail")
    .eq("action", action)
    .eq("code", code)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not read the problem log: ${error.message}`);
  return data;
}

/**
 * Makes this page behave like one built before the latest keys: its forms send an older key.
 * The key is swapped as the form is sent (a hidden input's value is its attribute, which React
 * rewrites on every render); a real old page simply has the old key in its own code.
 */
async function makePageOutdated(page: Page): Promise<void> {
  await page.evaluate((oldKey) => {
    window.addEventListener("submit", (event) => (event.target as HTMLFormElement).querySelectorAll<HTMLInputElement>('input[name="botCheckKey"]').forEach((input) => (input.value = oldKey)), { capture: true });
  }, OLD_SITE_KEY);
}

/** Server action calls go to an id the server doesn't know, as after a release. */
async function makeServerActionsStale(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const headers = route.request().headers();
    if (!headers[SERVER_ACTION_HEADER]) return route.continue();
    return route.continue({ headers: { ...headers, [SERVER_ACTION_HEADER]: "0".repeat(42) } });
  });
}

/** Changes a form field the moment the form is sent (React rewrites hidden fields on render). */
async function changeFieldOnSubmit(page: Page, { name, value }: { name: string; value: string | null }): Promise<void> {
  await page.evaluate(
    ({ fieldName, fieldValue }) => {
      window.addEventListener(
        "submit",
        (event) => (event.target as HTMLFormElement).querySelectorAll<HTMLInputElement>(`input[name="${fieldName}"]`).forEach((input) => (fieldValue === null ? input.remove() : (input.value = fieldValue))),
        { capture: true },
      );
    },
    { fieldName: name, fieldValue: value },
  );
}

async function fillContactForm(page: Page): Promise<void> {
  await page.getByLabel("Full name").fill("Jordan Smith");
  await page.getByLabel("Email").fill("jordan@example.com");
  await page.getByLabel("How can we help?").fill("I'd like a showing this weekend.");
}

async function openChat(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/about");
  await page.getByRole("button", { name: "Chat with us" }).click();
  await expect(page.getByRole("dialog", { name: "CWR Assistant" })).toBeVisible();
}

test.describe("listing photo gallery", () => {
  test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, "Needs a database with imported content");

  test("the arrows step through every photo and say where you are", async ({ page }) => {
    // Arrange
    await page.goto(LISTING_PATH);
    const gallery = page.getByRole("region", { name: "Photos of 5423 Pine Level Dr" });

    // Act
    await gallery.getByRole("button", { name: "Next photo" }).click();
    await gallery.getByRole("button", { name: "Next photo" }).click();

    // Assert
    await expect(gallery.getByText("3 of 3", { exact: true })).toBeVisible();
    await expect(gallery.getByRole("button", { name: "Next photo" })).toHaveAttribute("aria-disabled", "true");
  });

  test("a thumbnail jumps straight to its photo", async ({ page }) => {
    // Arrange
    await page.goto(LISTING_PATH);
    const gallery = page.getByRole("region", { name: "Photos of 5423 Pine Level Dr" });

    // Act
    await gallery.getByRole("button", { name: "Show photo 3 of 3" }).click();

    // Assert
    await expect(gallery.getByRole("button", { name: "Show photo 3 of 3" })).toHaveAttribute("aria-current", "true");
  });

  test("arrow keys move between photos and focus follows the photo", async ({ page }) => {
    // Arrange
    await page.goto(LISTING_PATH);
    await page.getByRole("button", { name: /Front of the test home, photo 1 of 3, open full screen/ }).focus();

    // Act
    await page.keyboard.press("ArrowRight");

    // Assert
    await expect(page.getByRole("button", { name: /Second view of the test home, photo 2 of 3/ })).toBeFocused();
  });

  test("a swipe (scrolling the photo strip) changes the photo", async ({ page }) => {
    // Arrange
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto(LISTING_PATH);
    const gallery = page.getByRole("region", { name: "Photos of 5423 Pine Level Dr" });

    // Act
    await gallery.locator(".photo-track").evaluate((track) => track.scrollTo({ left: track.clientWidth, behavior: "instant" }));

    // Assert
    await expect(gallery.getByText("2 of 3", { exact: true })).toBeVisible();
  });

  test("tapping a photo opens it full screen and Close returns to the listing", async ({ page }) => {
    // Arrange
    await page.goto(LISTING_PATH);
    await page.getByRole("button", { name: /Front of the test home, photo 1 of 3/ }).click();
    const viewer = page.getByRole("dialog", { name: "Photos of 5423 Pine Level Dr, full screen" });
    await expect(viewer).toBeVisible();

    // Act
    await viewer.getByRole("button", { name: "Close full-screen photos" }).click();

    // Assert
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${LISTING_PATH}$`));
    await expect(page.getByRole("button", { name: /Front of the test home, photo 1 of 3/ })).toBeFocused();
  });

  test("the phone's Back button closes full screen instead of leaving the listing", async ({ page }) => {
    // Arrange
    await page.goto("/listings");
    await page.goto(LISTING_PATH);
    await page.getByRole("button", { name: /Front of the test home, photo 1 of 3/ }).click();
    const viewer = page.getByRole("dialog", { name: "Photos of 5423 Pine Level Dr, full screen" });
    await expect(viewer).toBeVisible();

    // Act
    await page.goBack();

    // Assert
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${LISTING_PATH}$`));
  });

  test("Esc closes full screen and leaves no extra history step", async ({ page }) => {
    // Arrange
    await page.goto("/listings");
    await page.goto(LISTING_PATH);
    await page.getByRole("button", { name: /Front of the test home, photo 1 of 3/ }).click();
    await expect(page.getByRole("dialog", { name: "Photos of 5423 Pine Level Dr, full screen" })).toBeVisible();

    // Act
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Photos of 5423 Pine Level Dr, full screen" })).toBeHidden();
    await page.goBack();

    // Assert
    await expect(page).toHaveURL(/\/listings$/);
  });

  test("a reload while full screen is open starts with it closed", async ({ page }) => {
    // Arrange
    await page.goto(LISTING_PATH);
    await page.getByRole("button", { name: /Front of the test home, photo 1 of 3/ }).click();
    await expect(page.getByRole("dialog", { name: "Photos of 5423 Pine Level Dr, full screen" })).toBeVisible();

    // Act
    await page.reload();

    // Assert
    await expect(page.getByRole("dialog", { name: "Photos of 5423 Pine Level Dr, full screen" })).toBeHidden();
    expect(await page.evaluate(() => window.history.state?.cwrPhotoViewer ?? null)).toBeNull();
  });

  test("the listing card says how many photos there are", async ({ page }) => {
    // Arrange / Act
    await page.goto("/listings");

    // Assert
    await expect(page.getByRole("link", { name: /5423 Pine Level Dr/ }).getByText("3 photos")).toBeVisible();
  });

  for (const [viewportName, viewport] of Object.entries({ "small phone": VIEWPORTS.smallPhone, desktop: VIEWPORTS.desktop })) {
    test(`the gallery and full-screen viewer pass WCAG 2.2 AA without sideways page scroll on ${viewportName}`, async ({ page }) => {
      // Arrange
      await page.setViewportSize(viewport);
      await page.goto(LISTING_PATH);
      await page.getByRole("button", { name: /Front of the test home, photo 1 of 3/ }).click();

      // Act
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const hasSidewaysScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

      // Assert
      expect({ violations: results.violations, hasSidewaysScroll }).toEqual({ violations: [], hasSidewaysScroll: false });
    });
  }
});

test.describe("Quick Check", () => {
  test("a press of Send while the check is still running is sent once it passes", async ({ page }) => {
    // Arrange
    test.skip(!HAS_ADMIN_DATABASE || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "Needs the local database and the test site key");
    await page.route(TURNSTILE_SCRIPT, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await page.goto("/contact");
    await fillContactForm(page);

    // Act
    await page.getByRole("button", { name: "Send message" }).click();

    // Assert
    await expect(page.getByText("Running a quick check…")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Thanks, Jordan. Your message is in." })).toBeVisible({ timeout: 20_000 });
  });

  test("a check that can't load says so and offers Try again", async ({ page }) => {
    // Arrange
    test.skip(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "Needs the test site key");
    await page.route(TURNSTILE_SCRIPT, (route) => route.abort("blockedbyclient"));

    // Act
    await page.goto("/contact");

    // Assert
    await expect(page.getByText("The quick check didn't load.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("an out-of-date contact page offers Refresh page and keeps the message", async ({ page }) => {
    // Arrange
    test.skip(!HAS_ADMIN_DATABASE || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "Needs the local database and the test site key");
    const since = new Date().toISOString();
    await page.goto("/contact");
    await fillContactForm(page);
    await waitForBotCheck(page);
    await makePageOutdated(page);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("This page was out of date. Tap Refresh page and what you typed will be kept.")).toBeVisible();

    // Act
    await page.getByRole("button", { name: "Refresh page" }).click();

    // Assert
    await expect(page.getByLabel("How can we help?")).toHaveValue("I'd like a showing this weekend.");
    expect(await fetchLatestProblem({ action: "site.contact_form", code: "outdated_page", since })).toMatchObject({ origin: "server_visitor", severity: "warning" });
  });

  test("a refused Quick Check says so, offers Refresh page, and is recorded", async ({ page }) => {
    // Arrange
    test.skip(!HAS_ADMIN_DATABASE || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "Needs the local database and the test site key");
    const since = new Date().toISOString();
    await page.goto("/contact");
    await fillContactForm(page);
    await waitForBotCheck(page);
    await changeFieldOnSubmit(page, { name: "cf-turnstile-response", value: "" });

    // Act
    await page.getByRole("button", { name: "Send message" }).click();

    // Assert
    await expect(page.getByText("The quick check didn't go through. Try again. If it happens again, tap Refresh page.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh page" })).toBeVisible();
    expect(await fetchLatestProblem({ action: "site.bot_check", code: "no_token", since })).toMatchObject({ origin: "server_visitor", severity: "info" });
  });

  test("a page from before this release (no key field) still goes through the normal check", async ({ page }) => {
    // Arrange
    test.skip(!HAS_ADMIN_DATABASE || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "Needs the local database and the test site key");
    await page.goto("/contact");
    await fillContactForm(page);
    await waitForBotCheck(page);
    await changeFieldOnSubmit(page, { name: "botCheckKey", value: null });

    // Act
    await page.getByRole("button", { name: "Send message" }).click();

    // Assert
    await expect(page.getByRole("heading", { name: "Thanks, Jordan. Your message is in." })).toBeVisible();
  });

  test("a contact page left open across a release offers Refresh page instead of a crash screen", async ({ page }) => {
    // Arrange
    test.skip(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, "Needs the test site key");
    const since = new Date().toISOString();
    await page.goto("/contact");
    await fillContactForm(page);
    await waitForBotCheck(page);
    await makeServerActionsStale(page);

    // Act
    await page.getByRole("button", { name: "Send message" }).click();

    // Assert
    await expect(page.getByText("This page was out of date. Tap Refresh page and what you typed will be kept.")).toBeVisible();
    await expect(page.getByText(/CWR-[0-9A-Z]{3}-[0-9A-Z]{3}/)).toHaveCount(0);
    if (HAS_ADMIN_DATABASE) {
      await expect.poll(() => fetchLatestProblem({ action: "site.contact_form", code: "stale_page", since })).toMatchObject({ origin: "browser_visitor", severity: "warning" });
    }
  });
});

test.describe("chat", () => {
  test("a chat call that fails never leaves the chat stuck on “replying”", async ({ page }) => {
    // Arrange
    await openChat(page);
    await page.getByLabel("Your question").fill("Do you work in High Point?");
    await waitForBotCheck(page);
    await page.route("**/*", (route) => (route.request().headers()[SERVER_ACTION_HEADER] ? route.abort("failed") : route.continue()));

    // Act
    await page.getByRole("button", { name: "Send" }).click();

    // Assert
    await expect(page.getByText("We couldn't reach the assistant. Try again, or tap “Talk to a person”.")).toBeVisible();
    await expect(page.getByText("The assistant is replying…")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send" })).toHaveAttribute("aria-busy", "false");
  });

  test("a second question in the same chat needs no Quick Check", async ({ page }) => {
    // Arrange
    test.skip(!HAS_ADMIN_DATABASE, "Needs the local database");
    await openChat(page);
    await page.getByLabel("Your question").fill("Do you work in High Point?");
    await waitForBotCheck(page);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("log", { name: "Chat messages" }).getByText(/a person on our team can/).first()).toBeVisible();

    // Act
    await page.getByLabel("Your question").fill("And Greensboro?");
    await page.getByRole("button", { name: "Send" }).click();

    // Assert
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveCount(0);
    await expect(page.getByRole("log", { name: "Chat messages" }).getByText("And Greensboro?")).toBeVisible();
  });
});

test.describe("website visitors' problems in the log", () => {
  test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");

  test("a visitor's browser report is stored as a visitor's, without any text", async ({ page }) => {
    // Arrange
    const since = new Date().toISOString();
    await page.goto("/listings");

    // Act
    const status = await page.evaluate(async () => {
      const report = { id: crypto.randomUUID(), action: "site.listing_photo", stage: "browser", severity: "critical", code: "image_failed", shownMessage: "typed text", detail: "typed text", pagePath: "/listings/x" };
      const response = await fetch("/admin/problems/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) });
      return response.status;
    });

    // Assert
    expect({ status, problem: await fetchLatestProblem({ action: "site.listing_photo", code: "image_failed", since }) }).toEqual({
      status: 200,
      problem: { action: "site.listing_photo", origin: "browser_visitor", severity: "warning", code: "image_failed", shown_message: null, detail: "" },
    });
  });

  test("a visitor action claiming to come from an admin page isn't taken as a visitor's", async ({ page }) => {
    // Arrange
    await page.goto("/listings");

    // Act
    const status = await page.evaluate(async () => {
      const report = { id: crypto.randomUUID(), action: "site.listing_photo", stage: "browser", severity: "warning", code: "image_failed", pagePath: "/admin/listings" };
      const response = await fetch("/admin/problems/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) });
      return response.status;
    });

    // Assert
    expect(status).toBe(401);
  });

  test("a signed-out browser still can't report admin problems", async ({ page }) => {
    // Arrange
    await page.goto("/listings");

    // Act
    const status = await page.evaluate(async () => {
      const report = { id: crypto.randomUUID(), action: "homework.upload_file", stage: "browser", severity: "error", code: "network", pagePath: "/admin/homework" };
      const response = await fetch("/admin/problems/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) });
      return response.status;
    });

    // Assert
    expect(status).toBe(401);
  });
});
