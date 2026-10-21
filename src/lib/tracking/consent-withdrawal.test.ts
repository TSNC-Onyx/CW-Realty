import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Browser-only module: window, document, the data layer, and fetch are stand-ins that write to
// one shared log, so the test can check the order of what a withdrawal does.

const TAG_MANAGER = { containerId: "GTM-ABC1234", scriptOrigin: "https://www.googletagmanager.com", nonce: "nonce-123" };
const NARROWER_COOKIE = "cwr_consent=narrower; Path=/";

let log: string[] = [];

async function loadModules() {
  vi.resetModules();
  const dataLayer = await import("@/lib/tracking/data-layer");
  const withdrawal = await import("@/lib/tracking/consent-withdrawal");
  return { ...dataLayer, ...withdrawal };
}

function getLogEntry(entry: unknown): string {
  const parts = Object.prototype.toString.call(entry) === "[object Arguments]" ? Array.from(entry as ArrayLike<unknown>) : entry;
  return `dataLayer ${JSON.stringify(parts)}`;
}

function stubBrowser(): void {
  const dataLayer: unknown[] = [];
  dataLayer.push = (...entries: unknown[]) => {
    entries.forEach((entry) => log.push(getLogEntry(entry)));
    return Array.prototype.push.apply(dataLayer, entries);
  };
  vi.stubGlobal("window", {
    dataLayer,
    location: { hostname: "www.charliewardrealty.com", reload: () => log.push("reload") },
    sessionStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    dispatchEvent: () => true,
  });
  vi.stubGlobal("document", {
    get cookie() {
      return "_ga=GA1.1.123.456; cwr_consent=old";
    },
    set cookie(value: string) {
      log.push(`cookie ${value.split(";")[0]}`);
    },
    createElement: () => ({}),
    head: { append: () => undefined },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      log.push("fetch /consent");
      return new Response(null, { status: 204 });
    }),
  );
}

beforeEach(() => {
  log = [];
  stubBrowser();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("withdrawConsent", () => {
  it("tells running tags about the narrower choice before waiting, then deletes tracker cookies just before reloading", async () => {
    // Arrange
    const { startTagManager, withdrawConsent } = await loadModules();
    startTagManager({ ...TAG_MANAGER, choice: { analytics: true, ads: true } });
    log = [];

    // Act
    await withdrawConsent({ previous: { analytics: true, ads: true }, next: { analytics: true, ads: false }, cookieString: NARROWER_COOKIE });

    // Assert
    const steps = log.filter((entry) => entry.startsWith("dataLayer") || entry === "fetch /consent" || entry.startsWith("cookie _ga") || entry === "reload");
    expect([steps[0], steps[1], steps.at(-2), steps.at(-1)]).toEqual([
      `dataLayer ${JSON.stringify(["consent", "update", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" }])}`,
      "fetch /consent",
      "cookie _ga=",
      "reload",
    ]);
  });

  it("sends no cwr_consent_update when a choice turns one category off and another on", async () => {
    // Arrange
    const { startTagManager, withdrawConsent } = await loadModules();
    startTagManager({ ...TAG_MANAGER, choice: { analytics: true, ads: false } });

    // Act
    await withdrawConsent({ previous: { analytics: true, ads: false }, next: { analytics: false, ads: true }, cookieString: NARROWER_COOKIE });

    // Assert
    expect(log.some((entry) => entry.includes("cwr_consent_update"))).toBe(false);
  });
});
