import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Browser-only module: a minimal window and document stand in, and each test loads a fresh
// copy so "Tag Manager is running" never leaks between tests.

type FakeScript = { async: boolean; src: string; nonce: string };

const TAG_MANAGER = { containerId: "GTM-ABC1234", scriptOrigin: "https://www.googletagmanager.com", nonce: "nonce-123" };

let appendedScripts: FakeScript[] = [];

async function loadDataLayer() {
  vi.resetModules();
  return import("@/lib/tracking/data-layer");
}

function getDataLayer(): unknown[] {
  return (globalThis as unknown as { window: { dataLayer: unknown[] } }).window.dataLayer ?? [];
}

function getCommands(): unknown[][] {
  return getDataLayer().filter((entry) => !Array.isArray(entry) && typeof entry === "object" && entry !== null && "length" in entry).map((entry) => Array.from(entry as ArrayLike<unknown>));
}

describe("Tag Manager", () => {
  beforeEach(() => {
    appendedScripts = [];
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      createElement: () => ({ async: false, src: "", nonce: "" }),
      head: { append: (script: FakeScript) => appendedScripts.push(script) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets every consent type to denied before applying the visitor's choice", async () => {
    // Arrange
    const { startTagManager } = await loadDataLayer();

    // Act
    startTagManager({ ...TAG_MANAGER, choice: { analytics: true, ads: false } });

    // Assert
    expect(getCommands()).toEqual([
      ["consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied", wait_for_update: 500 }],
      ["consent", "update", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" }],
    ]);
  });

  it("loads the container once, carrying the page nonce", async () => {
    // Arrange
    const { startTagManager } = await loadDataLayer();

    // Act
    startTagManager({ ...TAG_MANAGER, choice: { analytics: true, ads: true } });
    startTagManager({ ...TAG_MANAGER, choice: { analytics: true, ads: true } });

    // Assert
    expect(appendedScripts).toEqual([{ async: true, src: "https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234", nonce: "nonce-123" }]);
  });

  it("sends no key event before the visitor allows tracking", async () => {
    // Arrange
    const { pushKeyEvent } = await loadDataLayer();

    // Act
    pushKeyEvent({ name: "cwr_call", eventId: "event-1" });

    // Assert
    expect(getDataLayer()).toEqual([]);
  });

  it("leaves hashed contact details out when only Analytics is allowed", async () => {
    // Arrange
    const { pushKeyEvent, startTagManager } = await loadDataLayer();
    startTagManager({ ...TAG_MANAGER, choice: { analytics: true, ads: false } });

    // Act
    pushKeyEvent({ name: "cwr_contact_form", eventId: "event-2", userData: { sha256_email_address: "abc" } });

    // Assert
    expect(getDataLayer().at(-1)).toEqual({ event: "cwr_contact_form", event_id: "event-2" });
  });

  it("adds hashed contact details for Enhanced Conversions when Advertising is allowed", async () => {
    // Arrange
    const { pushKeyEvent, startTagManager } = await loadDataLayer();
    startTagManager({ ...TAG_MANAGER, choice: { analytics: false, ads: true } });

    // Act
    pushKeyEvent({ name: "cwr_chat_handoff", eventId: "event-3", userData: { sha256_email_address: "abc" } });

    // Assert
    expect(getDataLayer().at(-1)).toEqual({ event: "cwr_chat_handoff", event_id: "event-3", user_data: { sha256_email_address: "abc" } });
  });
});
