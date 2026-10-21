import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Response } from "@playwright/test";

import { HAS_ADMIN_DATABASE, createTestAdmin, signInFully, waitForBotCheck } from "../admin/admin-helpers";
import { getCornerViolations, getGoldOnLightViolations, getSmallTextViolations, getTapTargetViolations } from "../design-checks";
import { VIEWPORTS } from "../pages";
import { TEST_CONTAINER_ID, fetchLeadAttribution, getDataLayer, setTrackingContainer, watchTrackerRequests } from "./tracking-helpers";

// Phase 6: cookie banner, Consent Mode, key events, and ad click IDs. Tag Manager is switched on
// for the whole site here, so these tests run one at a time after every other test.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const GCLID = "TeSt_gclid_0123456789";

test.skip(!HAS_ADMIN_DATABASE, "Needs the local database and service-role key");
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await setTrackingContainer(TEST_CONTAINER_ID);
});

test.afterAll(async () => {
  await setTrackingContainer(null);
});

function getBanner(page: Page) {
  return page.getByRole("region", { name: "Cookie choices" });
}

async function fetchConsentCookie(page: Page): Promise<{ analytics: boolean; ads: boolean } | null> {
  const cookie = (await page.context().cookies()).find((entry) => entry.name === "cwr_consent");
  return cookie ? JSON.parse(decodeURIComponent(cookie.value)) : null;
}

async function fetchCookieNames(page: Page): Promise<string[]> {
  return (await page.context().cookies()).map((cookie) => cookie.name);
}

function isConsentCall(response: Response): boolean {
  return response.url().endsWith("/consent") && response.request().method() === "POST";
}

async function sendContactForm(page: Page, email: string): Promise<void> {
  await page.getByLabel("Full name").fill("Avery Lead");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("How can we help?").fill("I saw your ad.");
  await waitForBotCheck(page);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("heading", { name: "Thanks, Avery. Your message is in." })).toBeVisible();
}

test("the banner offers Accept all and Reject all equally, and nothing tracks before a choice", async ({ page, context }) => {
  // Arrange
  const trackerRequests = await watchTrackerRequests(context);

  // Act
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Assert
  const banner = getBanner(page);
  const acceptClass = await banner.getByRole("button", { name: "Accept all" }).getAttribute("class");
  await expect(banner.getByRole("button", { name: "Reject all" })).toHaveAttribute("class", acceptClass ?? "");
  expect(trackerRequests).toEqual([]);
});

test("Reject all saves the choice and keeps every tracker off", async ({ page, context }) => {
  // Arrange
  const trackerRequests = await watchTrackerRequests(context);
  await page.goto("/");

  // Act
  await getBanner(page).getByRole("button", { name: "Reject all" }).click();
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Assert
  await expect(getBanner(page)).toHaveCount(0);
  expect({ cookie: await fetchConsentCookie(page), trackerRequests }).toMatchObject({ cookie: { analytics: false, ads: false }, trackerRequests: [] });
});

test("if the server can't be reached the choice still works", async ({ page, context }) => {
  // Arrange
  await watchTrackerRequests(context);
  await page.route("**/consent", (route) => route.abort());
  await page.goto("/");

  // Act
  await getBanner(page).getByRole("button", { name: "Reject all" }).click();
  await page.reload();

  // Assert
  await expect(getBanner(page)).toHaveCount(0);
  expect(await fetchConsentCookie(page)).toMatchObject({ analytics: false, ads: false });
});

test("Accept all starts Tag Manager with the page nonce, after consent defaults of denied", async ({ page, context }) => {
  // Arrange
  const trackerRequests = await watchTrackerRequests(context);
  await page.goto("/");

  // Act
  await getBanner(page).getByRole("button", { name: "Accept all" }).click();

  // Assert
  await expect.poll(() => trackerRequests).toContainEqual(expect.stringContaining(`gtm.js?id=${TEST_CONTAINER_ID}`));
  const nonce = await page.evaluate(() => document.querySelector<HTMLScriptElement>('script[src*="gtm.js"]')?.nonce ?? "");
  const [defaults, update] = await getDataLayer(page);
  expect({ hasNonce: nonce.length > 0, defaults, update }).toEqual({
    hasNonce: true,
    defaults: ["consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied", wait_for_update: 500 }],
    update: ["consent", "update", { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted" }],
  });
});

/** Lands on the home page from an ad, then moves to another page without a full page load. */
async function moveAwayFromAdLanding(page: Page): Promise<void> {
  await page.goto(`/?gclid=${GCLID}`);
  await page.evaluate(() => Object.assign(window, { hasNotReloaded: true }));
  await page.getByRole("navigation", { name: "Main" }).getByRole("link").first().click();
  await expect(page).not.toHaveURL(/gclid=/);
  expect(await page.evaluate(() => (window as unknown as { hasNotReloaded?: boolean }).hasNotReloaded)).toBe(true);
}

test("click IDs are back in the address before Tag Manager starts after moving to another page", async ({ page, context }) => {
  // Arrange
  await watchTrackerRequests(context);
  await moveAwayFromAdLanding(page);

  // Act
  await getBanner(page).getByRole("button", { name: "Accept all" }).click();

  // Assert
  await expect(page).toHaveURL(new RegExp(`gclid=${GCLID}`));
  await expect.poll(async () => (await getDataLayer(page)).some((entry) => (entry as { event?: string }).event === "gtm.js")).toBe(true);
});

test("rejecting keeps click IDs out of the address", async ({ page, context }) => {
  // Arrange
  await watchTrackerRequests(context);
  await moveAwayFromAdLanding(page);

  // Act
  await getBanner(page).getByRole("button", { name: "Reject all" }).click();

  // Assert
  await expect(getBanner(page)).toHaveCount(0);
  expect(page.url()).not.toContain("gclid=");
});

test("a tap on the phone number is reported as a call once the visitor agrees", async ({ page, context }) => {
  // Arrange
  await watchTrackerRequests(context);
  await page.goto("/");
  await getBanner(page).getByRole("button", { name: "Accept all" }).click();
  // The test browser cannot place calls: stop the tel: link after the site has seen the tap.
  await page.evaluate(() => document.addEventListener("click", (event) => event.preventDefault()));

  // Act
  await page.locator('footer a[href^="tel:"]').first().click();

  // Assert
  await expect.poll(async () => (await getDataLayer(page)).some((entry) => (entry as { event?: string }).event === "cwr_call")).toBe(true);
});

test("withdrawing consent deletes tracker cookies and reloads without Tag Manager", async ({ page, context, baseURL }) => {
  // Arrange
  await watchTrackerRequests(context);
  await page.goto("/");
  await getBanner(page).getByRole("button", { name: "Accept all" }).click();
  await context.addCookies([{ name: "_ga", value: "GA1.1.123.456", url: baseURL ?? "" }]);

  // Act
  await page.getByRole("contentinfo").getByRole("link", { name: "Cookie settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Cookie settings" });
  await dialog.getByRole("checkbox", { name: "Analytics" }).uncheck();
  await dialog.getByRole("checkbox", { name: "Advertising" }).uncheck();
  await Promise.all([page.waitForEvent("load"), dialog.getByRole("button", { name: "Save choices" }).click()]);

  // Assert
  const cookieNames = (await context.cookies()).map((cookie) => cookie.name);
  expect({ hasGaCookie: cookieNames.includes("_ga"), consent: await fetchConsentCookie(page) }).toMatchObject({ hasGaCookie: false, consent: { analytics: false, ads: false } });
});

test("allowing Advertising after Analytics sends cwr_consent_update", async ({ page, context }) => {
  // Arrange
  await watchTrackerRequests(context);
  await page.goto("/");
  await getBanner(page).getByRole("button", { name: "Cookie settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Cookie settings" });
  await dialog.getByRole("checkbox", { name: "Analytics" }).check();
  await dialog.getByRole("button", { name: "Save choices" }).click();
  await expect.poll(async () => (await getDataLayer(page)).some((entry) => (entry as { event?: string }).event === "gtm.js")).toBe(true);

  // Act
  await page.getByRole("contentinfo").getByRole("link", { name: "Cookie settings" }).click();
  await dialog.getByRole("checkbox", { name: "Advertising" }).check();
  await dialog.getByRole("button", { name: "Save choices" }).click();

  // Assert
  await expect.poll(async () => (await getDataLayer(page)).filter((entry) => (entry as { event?: string }).event === "cwr_consent_update").length).toBe(1);
});

test("Global Privacy Control keeps advertising off and says why", async ({ browser }) => {
  // Arrange
  const context = await browser.newContext({ extraHTTPHeaders: { "Sec-GPC": "1" } });
  await context.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { value: true }));
  await watchTrackerRequests(context);
  const page = await context.newPage();
  await page.goto("/");
  await expect(getBanner(page)).toContainText("advertising cookies stay off");
  await getBanner(page).getByRole("button", { name: "Cookie settings" }).click();
  await expect(page.getByRole("dialog", { name: "Cookie settings" }).getByRole("checkbox", { name: "Advertising" })).toBeDisabled();
  await page.keyboard.press("Escape");

  // Act
  await getBanner(page).getByRole("button", { name: "Accept all" }).click();

  // Assert
  expect(await fetchConsentCookie(page)).toMatchObject({ analytics: true, ads: false });
  await context.close();
});

test("Escape closes cookie settings and returns focus to the link that opened it", async ({ page }) => {
  // Arrange
  await page.goto("/about");
  const footerLink = page.getByRole("contentinfo").getByRole("link", { name: "Cookie settings" });
  await footerLink.click();
  await expect(page.getByRole("dialog", { name: "Cookie settings" })).toBeVisible();

  // Act
  await page.keyboard.press("Escape");

  // Assert
  await expect(page.getByRole("dialog", { name: "Cookie settings" })).toBeHidden();
  await expect(footerLink).toBeFocused();
});

test("on desktop the banner stays clear of the chat launcher", async ({ page }) => {
  // Arrange
  await page.setViewportSize(VIEWPORTS.desktop);

  // Act
  await page.goto("/");

  // Assert
  const banner = await getBanner(page).boundingBox();
  const launcher = await page.getByRole("button", { name: "Chat with us" }).boundingBox();
  expect((banner?.x ?? 0) + (banner?.width ?? 0)).toBeLessThan(launcher?.x ?? 0);
});

test("on phones the banner sits above the Call, Text, and Chat bar", async ({ page }) => {
  // Arrange
  await page.setViewportSize(VIEWPORTS.phone);

  // Act
  await page.goto("/");

  // Assert
  const banner = await getBanner(page).boundingBox();
  const actionBar = await page.getByRole("navigation", { name: "Quick contact" }).boundingBox();
  expect((banner?.y ?? 0) + (banner?.height ?? 0)).toBeLessThanOrEqual((actionBar?.y ?? 0) + 1);
});

for (const [viewportName, viewport] of Object.entries({ phone: VIEWPORTS.phone, desktop: VIEWPORTS.desktop })) {
  test(`the banner and cookie settings pass accessibility and design checks on ${viewportName}`, async ({ page }) => {
    // Arrange
    await page.setViewportSize(viewport);
    await page.goto("/");
    const bannerProblems = [...(await getTapTargetViolations(page)), ...(await getGoldOnLightViolations(page)), ...(await getCornerViolations(page)), ...(await getSmallTextViolations(page))];
    await getBanner(page).getByRole("button", { name: "Cookie settings" }).click();
    await expect(page.getByRole("dialog", { name: "Cookie settings" })).toBeVisible();

    // Act
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    // Assert
    expect({ axe: results.violations.map((violation) => violation.id), bannerProblems }).toEqual({ axe: [], bannerProblems: [] });
  });
}

test("ad click IDs are saved with a lead once the visitor allows advertising", async ({ page, context }) => {
  // Arrange
  await watchTrackerRequests(context);
  const email = `consented-${Date.now()}@example.com`;
  await page.goto(`/contact?gclid=${GCLID}&utm_source=google`);
  await getBanner(page).getByRole("button", { name: "Accept all" }).click();

  // Act
  await sendContactForm(page, email);

  // Assert
  const leadEvent = (await getDataLayer(page)).find((entry) => (entry as { event?: string }).event === "cwr_contact_form");
  expect({ attribution: await fetchLeadAttribution(email), hasEventId: Boolean((leadEvent as { event_id?: string } | undefined)?.event_id) }).toEqual({
    attribution: { gclid: GCLID, utm_source: "google" },
    hasEventId: true,
  });
});

test("a lead who rejected cookies carries no ad click IDs", async ({ page }) => {
  // Arrange
  const email = `rejected-${Date.now()}@example.com`;
  await page.goto(`/contact?gclid=${GCLID}`);
  await getBanner(page).getByRole("button", { name: "Reject all" }).click();

  // Act
  await sendContactForm(page, email);

  // Assert
  expect({ attribution: await fetchLeadAttribution(email), hasClickCookie: (await fetchCookieNames(page)).includes("cwr_attribution") }).toEqual({ attribution: null, hasClickCookie: false });
});

test("the server re-issues the consent cookie after a choice", async ({ page, context }) => {
  // Arrange
  await watchTrackerRequests(context);
  await page.goto("/");

  // Act
  const [response] = await Promise.all([page.waitForResponse(isConsentCall), getBanner(page).getByRole("button", { name: "Accept all" }).click()]);

  // Assert
  const setCookie = (await response.headerValue("set-cookie")) ?? "";
  const maxAge = Number(/cwr_consent=[^\n]*?Max-Age=(\d+)/.exec(setCookie)?.[1]);
  expect({ hasConsentCookie: setCookie.includes("cwr_consent="), isMaxAgeLeftOf180Days: maxAge >= 15551000 && maxAge <= 15552000 }).toEqual({ hasConsentCookie: true, isMaxAgeLeftOf180Days: true });
});

test("no consent call on a page load without new click IDs", async ({ page, context, baseURL }) => {
  // Arrange
  await watchTrackerRequests(context);
  const savedChoice = encodeURIComponent(JSON.stringify({ v: 1, analytics: true, ads: true, at: new Date().toISOString() }));
  await context.addCookies([{ name: "cwr_consent", value: savedChoice, url: baseURL ?? "" }]);
  const consentCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/consent")) consentCalls.push(request.url());
  });

  // Act
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.goto("/about");
  await page.waitForLoadState("networkidle");

  // Assert
  expect(consentCalls).toEqual([]);
});

test("a lead sent from a new tab keeps the ad click", async ({ page, context }) => {
  // Arrange
  await watchTrackerRequests(context);
  const email = `new-tab-${Date.now()}@example.com`;
  await page.goto(`/contact?gclid=${GCLID}`);
  await Promise.all([page.waitForResponse(isConsentCall), getBanner(page).getByRole("button", { name: "Accept all" }).click()]);
  const newTab = await context.newPage();
  await newTab.goto("/contact");

  // Act
  await sendContactForm(newTab, email);

  // Assert
  expect((await fetchLeadAttribution(email))?.gclid).toBe(GCLID);
});

test("withdrawing Advertising deletes the click cookie", async ({ page, context }) => {
  // Arrange
  await watchTrackerRequests(context);
  await page.goto(`/contact?gclid=${GCLID}`);
  await Promise.all([page.waitForResponse(isConsentCall), getBanner(page).getByRole("button", { name: "Accept all" }).click()]);
  await expect.poll(() => fetchCookieNames(page)).toContain("cwr_attribution");

  // Act
  await page.getByRole("contentinfo").getByRole("link", { name: "Cookie settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Cookie settings" });
  await dialog.getByRole("checkbox", { name: "Advertising" }).uncheck();
  await Promise.all([page.waitForEvent("load"), dialog.getByRole("button", { name: "Save choices" }).click()]);

  // Assert
  expect(await fetchCookieNames(page)).not.toContain("cwr_attribution");
});

test("owners see tracking is on and get a clear message for a wrong container ID", async ({ page }) => {
  // Arrange
  const owner = await createTestAdmin("owner");
  await signInFully(page, owner);
  await page.goto("/admin/tracking");
  await expect(page.getByText("Tracking: on after each visitor agrees")).toBeVisible();

  // Act
  await page.getByLabel("Container ID (optional)").fill("UA-12345");
  await page.getByRole("button", { name: "Save changes" }).click();

  // Assert
  await expect(page.getByText("Enter the container ID from Google Tag Manager, like GTM-AB12CD3")).toBeVisible();
});

test("each ID field says whether it is live, not saved yet, or off", async ({ page }) => {
  // Arrange
  const owner = await createTestAdmin("owner");
  const live = new RegExp(`Live on the website: ${TEST_CONTAINER_ID}$`);
  const stillUsed = new RegExp(`Not saved yet — the website still uses ${TEST_CONTAINER_ID}$`);
  await signInFully(page, owner);
  await page.goto("/admin/tracking");
  const container = page.getByLabel("Container ID (optional)");
  const pixel = page.getByLabel("Pixel ID (optional)");
  await expect(container).toHaveAccessibleDescription(live);
  await expect(pixel).toHaveAccessibleDescription(/Off — nothing saved$/);
  await expect(pixel).toHaveAccessibleDescription(/Meta server connection only/);

  // Act
  await container.fill("GTM-OTHER12");
  await expect(container).toHaveAccessibleDescription(stillUsed);
  await container.fill(TEST_CONTAINER_ID.toLowerCase());
  await expect(container).toHaveAccessibleDescription(live);
  await container.fill("");
  await expect(container).toHaveAccessibleDescription(/Not saved yet — saving will turn tracking off$/);
  await container.fill("UA-12345");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Enter the container ID from Google Tag Manager, like GTM-AB12CD3")).toBeVisible();
  await expect(container).toHaveAccessibleDescription(stillUsed);
  await container.fill(TEST_CONTAINER_ID.toLowerCase());
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved. Visitors now see the cookie choices." })).toBeVisible();

  // Assert
  await expect(container).toHaveValue(TEST_CONTAINER_ID);
  await expect(container).toHaveAccessibleDescription(live);
});

test("saving a container Google can't be reached for still saves and says so", async ({ page }) => {
  // Arrange: Playwright's web server points the container check at a closed local port (plan D2).
  const owner = await createTestAdmin("owner");
  await signInFully(page, owner);
  await page.goto("/admin/tracking");

  // Act
  await page.getByLabel("Container ID (optional)").fill(TEST_CONTAINER_ID);
  await page.getByRole("button", { name: "Save changes" }).click();

  // Assert
  await expect(page.getByRole("status").filter({ hasText: "We couldn't reach Google" })).toBeVisible();
  await expect(page.getByText("we couldn't reach Google just now")).toBeVisible();
});
