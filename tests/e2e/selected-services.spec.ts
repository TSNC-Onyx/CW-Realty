import { expect, test, type Page } from "@playwright/test";

import { VIEWPORTS } from "./pages";

// Selected services (docs/cwr-selected-services-plan.md): listed under Services, the old
// seller consulting link forwards here, prices never outsize titles, the CWR initials are
// styled, and below 1024px each audience's plans are a carousel (version B).

const PAGE_PATH = "/services/selected-services";
const OLD_PATH = "/services/seller-consulting";
const GOLD = "rgb(230, 189, 53)";
const GOLD_DEEP = "rgb(128, 98, 16)";
const SETTLE_MS = 900;

function getSection(page: Page, id: "buyer-plans" | "seller-plans") {
  return page.locator(`#${id}`);
}

async function getCurrentPlan(page: Page, id: "buyer-plans" | "seller-plans"): Promise<string> {
  return getSection(page, id).locator('.plan-list a[aria-current="true"] span').first().innerText();
}

test.describe("listing and links", () => {
  test("is the first page under Services in the menu", async ({ page }) => {
    // Arrange
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/");

    // Act
    const servicesButton = page.locator("header").getByRole("button", { name: "Services" });
    await servicesButton.click();
    const firstServiceLink = page.locator(`[id="${await servicesButton.getAttribute("aria-controls")}"]`).getByRole("link").first();

    // Assert
    await expect(firstServiceLink).toHaveText("Selected services");
  });

  test("is in the sitemap", async ({ request }) => {
    // Arrange
    const sitemapPath = "/sitemap.xml";

    // Act
    const sitemap = await (await request.get(sitemapPath)).text();

    // Assert
    expect(sitemap).toContain(PAGE_PATH);
  });

  test("lets search engines index it", async ({ page }) => {
    // Arrange
    await page.goto(PAGE_PATH);

    // Act
    const robots = page.locator('meta[name="robots"]');

    // Assert
    await expect(robots).toHaveCount(0);
  });

  test("the old seller consulting link forwards here permanently", async ({ request }) => {
    // Arrange
    const options = { maxRedirects: 0 };

    // Act
    const response = await request.get(OLD_PATH, options);

    // Assert
    expect({ status: response.status(), location: response.headers().location }).toEqual({ status: 301, location: PAGE_PATH });
  });

  test("is in the footer's Services column", async ({ page }) => {
    // Arrange
    await page.goto("/");

    // Act
    const footerLink = page.locator("footer").getByRole("link", { name: "Selected services" });

    // Assert
    await expect(footerLink).toHaveAttribute("href", PAGE_PATH);
  });

  test("the old link with a trailing slash also forwards in one hop", async ({ request }) => {
    // Arrange
    const options = { maxRedirects: 0 };

    // Act
    const response = await request.get(`${OLD_PATH}/`, options);

    // Assert
    expect({ status: response.status(), location: response.headers().location }).toEqual({ status: 301, location: PAGE_PATH });
  });

  test("the intro shows Charlie's portrait and direct line", async ({ page }) => {
    // Arrange
    await page.goto(PAGE_PATH);

    // Act
    const directLine = page.getByRole("link", { name: "Call Charlie's direct line, 336-708-0960" });

    // Assert
    await expect(directLine).toHaveAttribute("href", "tel:+13367080960");
    await expect(page.getByRole("link", { name: "Charlie Ward Sr." })).toHaveAttribute("href", "/team/charlie-ward");
  });

  test("has one page title", async ({ page }) => {
    // Arrange
    await page.goto(PAGE_PATH);

    // Act
    const titles = page.getByRole("heading", { level: 1 });

    // Assert
    await expect(titles).toHaveText(["Selected services"]);
  });
});

test.describe("plan cards", () => {
  test("every price line is smaller than its plan title", async ({ page }) => {
    // Arrange
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto(PAGE_PATH);

    // Act
    const oversized = await page.locator("main article").evaluateAll((cards) =>
      cards.filter((card) => {
        const title = parseFloat(getComputedStyle(card.querySelector("h3") as Element).fontSize);
        const price = card.querySelector("h3 + p") as Element;
        return [price, ...price.querySelectorAll("span")].some((part) => parseFloat(getComputedStyle(part).fontSize) >= title);
      }).length,
    );

    // Assert
    expect(oversized).toBe(0);
  });

  for (const id of ["buyer-plans", "seller-plans"] as const) {
    test(`${id} labels read Self-guided, Value Plus, Best Value (owner choice 2026-10-09)`, async ({ page }) => {
      // Arrange
      await page.setViewportSize(VIEWPORTS.desktop);
      await page.goto(PAGE_PATH);

      // Act
      const labels = await getSection(page, id).locator("article p.type-eyebrow").allTextContents();

      // Assert
      expect(labels.map((label) => label.trim())).toEqual(["Self-guided", "Value Plus", "Best Value"]);
    });
  }

  test("the plan initials C, W, R are bold and gold", async ({ page }) => {
    // Arrange
    await page.goto(PAGE_PATH);

    // Act
    const initials = await getSection(page, "seller-plans").locator("article h3").evaluateAll((titles) =>
      titles.map((title) => {
        const initial = getComputedStyle(title, "::first-letter");
        return `${title.textContent?.[0]} ${initial.fontWeight} ${initial.color}`;
      }),
    );

    // Assert
    expect(initials).toEqual([`C 700 ${GOLD_DEEP}`, `W 700 ${GOLD}`, `R 700 ${GOLD_DEEP}`]);
  });
});

test.describe("plan carousel on phones", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto(PAGE_PATH);
    await page.waitForTimeout(SETTLE_MS);
  });

  test("opens on the featured plan, with no scroll bar", async ({ page }) => {
    // Arrange
    const track = getSection(page, "buyer-plans").locator(".plan-track");

    // Act
    const scrollBarHeight = await track.evaluate((element) => (element as HTMLElement).offsetHeight - element.clientHeight);

    // Assert
    expect({ current: await getCurrentPlan(page, "buyer-plans"), scrollBarHeight }).toEqual({ current: "Working With You", scrollBarHeight: 0 });
  });

  test("choosing a plan in the list brings its card into view and focuses it", async ({ page }) => {
    // Arrange
    const section = getSection(page, "seller-plans");

    // Act
    await section.locator(".plan-list a").filter({ hasText: "Ready Through Close" }).click();
    await page.waitForTimeout(SETTLE_MS);

    // Assert
    const placement = await section.locator(".plan-slide").nth(2).evaluate((slide) => ({
      gap: Math.round(slide.getBoundingClientRect().top - (document.querySelector("header")?.getBoundingClientRect().bottom ?? 0)),
      isFocused: document.activeElement === slide,
    }));
    expect(placement).toEqual({ gap: 16, isFocused: true });
  });

  test("the arrows move between plans and stop at the last plan", async ({ page }) => {
    // Arrange
    const next = getSection(page, "buyer-plans").getByRole("button", { name: "Next plan" });

    // Act
    await next.click();
    await page.waitForTimeout(SETTLE_MS);

    // Assert
    expect({ current: await getCurrentPlan(page, "buyer-plans"), isAtEnd: await next.getAttribute("aria-disabled") }).toEqual({ current: "Ready Through Close", isAtEnd: "true" });
  });

  test("the Previous arrow goes back and stops at the first plan", async ({ page }) => {
    // Arrange
    const previous = getSection(page, "buyer-plans").getByRole("button", { name: "Previous plan" });

    // Act
    await previous.click();
    await page.waitForTimeout(SETTLE_MS);

    // Assert
    expect({ current: await getCurrentPlan(page, "buyer-plans"), isAtEnd: await previous.getAttribute("aria-disabled") }).toEqual({ current: "Consultation Plus", isAtEnd: "true" });
  });

  test("keyboard focus stays on an arrow that reaches the end", async ({ page }) => {
    // Arrange
    const next = getSection(page, "buyer-plans").getByRole("button", { name: "Next plan" });
    await next.focus();

    // Act
    await page.keyboard.press("Enter");
    await page.waitForTimeout(SETTLE_MS);

    // Assert
    await expect(next).toBeFocused();
  });

  test("speaks only after the visitor moves the carousel", async ({ page }) => {
    // Arrange
    const section = getSection(page, "buyer-plans");
    const liveRegion = section.locator("[aria-live=polite]");
    const textOnLoad = await liveRegion.textContent();

    // Act
    await section.getByRole("button", { name: "Next plan" }).click();
    await page.waitForTimeout(SETTLE_MS);

    // Assert
    expect({ textOnLoad, textAfterMove: await liveRegion.textContent() }).toEqual({ textOnLoad: "", textAfterMove: "Showing plan 3 of 3: Ready Through Close" });
  });

  test("announces itself as a carousel of labelled slides", async ({ page }) => {
    // Arrange
    const section = getSection(page, "buyer-plans");

    // Act
    const carousel = section.getByRole("group", { name: "Buyer plans" });

    // Assert
    await expect(carousel.getByRole("group", { name: "2 of 3: Working With You" })).toHaveCount(1);
  });
});

test("on desktop the plans are a grid without carousel controls", async ({ page }) => {
  // Arrange
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(PAGE_PATH);
  await page.waitForTimeout(SETTLE_MS);

  // Act
  const section = getSection(page, "buyer-plans");

  // Assert
  await expect(section.locator(".plan-list")).toBeHidden();
  await expect(section.getByRole("button", { name: "Next plan" })).toBeHidden();
  await expect(section.getByRole("group")).toHaveCount(0);
});

test("between 1024px and 1279px the full-service card spans the row, with its button sized to its label", async ({ page }) => {
  // Arrange
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(PAGE_PATH);

  // Act
  const sizes = await getSection(page, "buyer-plans").locator(".plan-slide").evaluateAll((slides) =>
    slides.map((slide) => ({ width: Math.round(slide.getBoundingClientRect().width), buttonWidth: Math.round((slide.querySelector("a.btn") as Element).getBoundingClientRect().width) })),
  );

  // Assert
  const [first, , wide] = sizes;
  expect(Boolean(first && wide && wide.width > first.width * 1.5 && wide.buttonWidth < wide.width / 2)).toBe(true);
});

test("without JavaScript the plan list still jumps to each plan", async ({ browser }) => {
  // Arrange
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: VIEWPORTS.phone });
  const page = await context.newPage();
  await page.goto(PAGE_PATH);
  const section = getSection(page, "buyer-plans");

  // Act
  await section.locator(".plan-list a").filter({ hasText: "Ready Through Close" }).click();

  // Assert
  await expect(section.locator(".plan-slide").nth(2)).toBeInViewport({ ratio: 0.3 });
  await expect(section.locator(".plan-arrows")).toHaveCSS("visibility", "hidden");
  await context.close();
});

test("nothing shifts while the page loads on a phone", async ({ page }) => {
  // Arrange
  await page.setViewportSize(VIEWPORTS.phone);
  await page.addInitScript(() => {
    const store = window as unknown as { layoutShift: number };
    store.layoutShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!entry.hadRecentInput) store.layoutShift += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });

  // Act
  await page.goto(`${PAGE_PATH}#buyer-plans`);
  await page.waitForTimeout(SETTLE_MS * 2);

  // Assert
  expect(await page.evaluate(() => (window as unknown as { layoutShift: number }).layoutShift)).toBeLessThan(0.01);
});

// Even section rhythm (docs/cwr-selected-services-spacing-plan.md): Buyer → Seller matches Intro → Buyer,
// and the "See seller plans" jump still lands with the heading clear of the sticky header.
const SPACING_CASES = [
  { name: "phone", viewport: VIEWPORTS.phone, minHeadingClearance: 48 },
  { name: "desktop", viewport: VIEWPORTS.desktop, minHeadingClearance: 96 },
] as const;
const GAP_TOLERANCE_PX = 2;

async function getGapAbove(page: Page, { previous, next }: { previous: string; next: string }): Promise<number> {
  const previousBox = await page.locator(previous).boundingBox();
  const nextBox = await page.locator(next).boundingBox();
  if (!previousBox || !nextBox) throw new Error(`Missing ${previous} or ${next}`);
  return nextBox.y - (previousBox.y + previousBox.height);
}

for (const { name, viewport, minHeadingClearance } of SPACING_CASES) {
  test(`on ${name} the gap between Buyer and Seller plans matches the gap under the intro`, async ({ page }) => {
    // Arrange
    await page.setViewportSize(viewport);
    await page.goto(PAGE_PATH);

    // Act
    const introGap = await getGapAbove(page, { previous: "main > div:first-child > div", next: "#buyer-plans-heading" });
    const plansGap = await getGapAbove(page, { previous: "#buyer-plans > div", next: "#seller-plans-heading" });

    // Assert
    expect(Math.abs(plansGap - introGap)).toBeLessThanOrEqual(GAP_TOLERANCE_PX);
  });

  test(`on ${name} "See seller plans" lands with the heading clear of the header`, async ({ page }) => {
    // Arrange
    await page.setViewportSize(viewport);
    await page.goto(PAGE_PATH);

    // Act
    await page.getByRole("link", { name: "See seller plans" }).first().click();
    await page.waitForTimeout(SETTLE_MS);
    const clearance = await getGapAbove(page, { previous: "header", next: "#seller-plans-heading" });

    // Assert
    expect(clearance).toBeGreaterThanOrEqual(minHeadingClearance - GAP_TOLERANCE_PX);
  });
}
