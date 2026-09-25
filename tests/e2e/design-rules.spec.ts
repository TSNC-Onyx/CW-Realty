import { expect, test, type Page } from "@playwright/test";

import { PUBLIC_PAGE_PATHS, VIEWPORTS } from "./pages";

// Automated Style §11.15 checks on the rendered pages: tap targets, gold only on
// dark surfaces, square corners except circles, no text under 14px, and no sideways
// scrolling at 320px (Style §3).

const MIN_TAP_SIZE_PX = 44;
const MIN_TEXT_SIZE_PX = 14;

function getTapTargetViolations(page: Page): Promise<string[]> {
  return page.evaluate((minSize) => {
    const selector = "a[href], button, input:not([type=hidden]), textarea, select, summary";
    const isInsideSentence = (element: Element) => element.tagName === "A" && element.closest("p") !== null;
    return [...document.querySelectorAll(selector)].flatMap((element) => {
      const box = element.getBoundingClientRect();
      const isRendered = box.width > 1 && box.height > 1;
      if (!isRendered || isInsideSentence(element)) return [];
      const isTooSmall = box.width < minSize || box.height < minSize;
      return isTooSmall ? [`${element.tagName} "${element.textContent?.trim()}" is ${Math.round(box.width)}×${Math.round(box.height)}`] : [];
    });
  }, MIN_TAP_SIZE_PX);
}

function getGoldOnLightViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const gold = "rgb(230, 189, 53)";
    const darkBackgrounds = ["rgb(18, 18, 18)", "rgb(30, 30, 30)", "rgb(43, 43, 43)"];
    const getBackground = (start: Element | null): string => {
      for (let node = start; node; node = node.parentElement) {
        const background = getComputedStyle(node).backgroundColor;
        if (background !== "rgba(0, 0, 0, 0)") return background;
      }
      return "rgb(255, 255, 255)";
    };
    return [...document.querySelectorAll("body *")].flatMap((element) => {
      if (element.getClientRects().length === 0) return [];
      const style = getComputedStyle(element);
      const isGoldFill = style.backgroundColor === gold;
      const isGoldInk = style.color === gold;
      if (!isGoldFill && !isGoldInk) return [];
      const surface = getBackground(isGoldFill ? element.parentElement : element);
      return darkBackgrounds.includes(surface) ? [] : [`${element.tagName}.${element.className} uses gold on ${surface}`];
    });
  });
}

function getCornerViolations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("body *")].flatMap((element) => {
      const radius = getComputedStyle(element).borderTopLeftRadius;
      const box = element.getBoundingClientRect();
      const isCircle = Math.abs(box.width - box.height) < 1;
      return radius === "0px" || isCircle ? [] : [`${element.tagName}.${element.className} has radius ${radius}`];
    }),
  );
}

function getSmallTextViolations(page: Page): Promise<string[]> {
  return page.evaluate((minSize) => {
    const hasOwnText = (element: Element) =>
      [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    return [...document.querySelectorAll("body *")].flatMap((element) => {
      if (!hasOwnText(element) || element.getClientRects().length === 0) return [];
      const fontSize = parseFloat(getComputedStyle(element).fontSize);
      return fontSize < minSize ? [`"${element.textContent?.trim().slice(0, 40)}" is ${fontSize}px`] : [];
    });
  }, MIN_TEXT_SIZE_PX);
}

for (const path of PUBLIC_PAGE_PATHS) {
  for (const [viewportName, viewport] of Object.entries({ phone: VIEWPORTS.phone, desktop: VIEWPORTS.desktop })) {
    test.describe(`${path} on ${viewportName}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(path);
      });

      test("every tap target is at least 44px", async ({ page }) => {
        // Arrange
        const expectedViolations: string[] = [];

        // Act
        const violations = await getTapTargetViolations(page);

        // Assert
        expect(violations).toEqual(expectedViolations);
      });

      test("gold appears only on dark surfaces", async ({ page }) => {
        // Arrange
        const expectedViolations: string[] = [];

        // Act
        const violations = await getGoldOnLightViolations(page);

        // Assert
        expect(violations).toEqual(expectedViolations);
      });

      test("corners are square except circles", async ({ page }) => {
        // Arrange
        const expectedViolations: string[] = [];

        // Act
        const violations = await getCornerViolations(page);

        // Assert
        expect(violations).toEqual(expectedViolations);
      });

      test("no text is smaller than 14px", async ({ page }) => {
        // Arrange
        const expectedViolations: string[] = [];

        // Act
        const violations = await getSmallTextViolations(page);

        // Assert
        expect(violations).toEqual(expectedViolations);
      });
    });
  }

  test(`${path} never scrolls sideways at 320px`, async ({ page }) => {
    // Arrange
    await page.setViewportSize(VIEWPORTS.smallPhone);
    await page.goto(path);

    // Act
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    // Assert
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
