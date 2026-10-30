import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLoaded, getLoadFailure } from "@/lib/admin/load-result";
import { getMetaHealth, getSavedMessage, getStatusLines, type MetaCheckRow, type MetaHealth, type TrackingSettingsRow } from "@/lib/admin/tracking/status-lines";

const ROW: TrackingSettingsRow = { gtm_container_id: "GTM-AB12CD3", meta_pixel_id: null, tags_reviewed_at: null };
const PIXEL_ROW: TrackingSettingsRow = { ...ROW, meta_pixel_id: "1234567890123" };
const NO_META_SENDS: MetaHealth = { isLoaded: true, check: null, lastProblemAt: null };

function getTrackingLabel(status: "published" | "not_found" | "unknown"): string | undefined {
  return getStatusLines({ row: ROW, container: { containerId: "GTM-AB12CD3", status }, metaHealth: NO_META_SENDS })[0]?.label;
}

function getMetaLabel(metaHealth: MetaHealth): string | undefined {
  return getStatusLines({ row: PIXEL_ROW, container: null, metaHealth })[1]?.label;
}

function getMetaCheck(overrides: Partial<MetaCheckRow>): MetaCheckRow {
  return { name: "meta_conversions", last_ok_at: null, last_error: null, last_error_at: null, ...overrides };
}

beforeEach(() => {
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "secret-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getStatusLines", () => {
  it("says tracking is on for a published container", () => {
    // Act
    const label = getTrackingLabel("published");

    // Assert
    expect(label).toBe("Tracking: on after each visitor agrees");
  });

  it("says tracking is not working when Google can't find the container", () => {
    // Act
    const label = getTrackingLabel("not_found");

    // Assert
    expect(label).toBe("Tracking: not working — Google can't find a published container GTM-AB12CD3. Publish it in Tag Manager or check the ID.");
  });

  it("says the check couldn't run when Google is unreachable", () => {
    // Act
    const label = getTrackingLabel("unknown");

    // Assert
    expect(label).toBe("Tracking: on after each visitor agrees (we couldn't reach Google just now to confirm the container is published)");
  });
});

describe("the browser Pixel line", () => {
  it("always explains that the browser Pixel lives in Tag Manager", () => {
    // Arrange
    const settings = [
      { row: null, container: null, metaHealth: NO_META_SENDS },
      { row: PIXEL_ROW, container: { containerId: "GTM-AB12CD3", status: "published" as const }, metaHealth: NO_META_SENDS },
    ];

    // Act
    const pixelLines = settings.map((setting) => getStatusLines(setting).find((line) => line.label.startsWith("Meta Pixel in visitors' browsers")));

    // Assert
    expect(pixelLines).toEqual([
      { label: "Meta Pixel in visitors' browsers: set up inside Tag Manager, not on this page", kind: "info" },
      { label: "Meta Pixel in visitors' browsers: set up inside Tag Manager, not on this page", kind: "info" },
    ]);
  });
});

describe("the Meta server connection line", () => {
  it("shows when the last lead reached Meta", () => {
    // Act
    const label = getMetaLabel({ isLoaded: true, check: getMetaCheck({ last_ok_at: "2026-10-21T19:04:00Z" }), lastProblemAt: null });

    // Assert
    expect(label).toBe("Meta server connection: on — last lead sent to Meta Oct 21, 3:04 PM");
  });

  it("says the Meta connection is not working after a failure", () => {
    // Arrange
    const check = getMetaCheck({ last_ok_at: "2026-10-01T14:00:00Z", last_error: "Meta answered 400, error code 190", last_error_at: "2026-10-21T19:04:00Z" });

    // Act
    const label = getMetaLabel({ isLoaded: true, check, lastProblemAt: "2026-10-21T19:04:00Z" });

    // Assert
    expect(label).toBe(
      "Meta server connection: not working — the last lead couldn't be sent on Oct 21, 3:04 PM (Meta answered 400, error code 190). Check the access token and the Pixel ID. Last success: Oct 1, 10:00 AM.",
    );
  });

  it("says no lead has been sent to Meta yet", () => {
    // Act
    const label = getMetaLabel(NO_META_SENDS);

    // Assert
    expect(label).toBe("Meta server connection: on — no lead sent to Meta yet");
  });

  it("mentions a passing failure newer than the last success", () => {
    // Act
    const label = getMetaLabel({ isLoaded: true, check: getMetaCheck({ last_ok_at: "2026-10-20T14:00:00Z" }), lastProblemAt: "2026-10-21T19:04:00Z" });

    // Assert
    expect(label).toBe("Meta server connection: on — last lead sent to Meta Oct 20, 10:00 AM. A try on Oct 21, 3:04 PM didn't get through (Meta was busy or didn't answer); later leads try again.");
  });

  it("words the passing-failure note as one past try, not the latest", () => {
    // Act
    const label = getMetaLabel({ isLoaded: true, check: getMetaCheck({ last_ok_at: "2026-10-20T14:00:00Z" }), lastProblemAt: "2026-10-21T19:04:00Z" }) ?? "";

    // Assert
    expect({ namesOneTry: label.includes("A try on"), claimsLatest: /\b(last|latest) (try|lead couldn't)/.test(label) }).toEqual({ namesOneTry: true, claimsLatest: false });
  });

  it("shows that the Meta status didn't load, with its reference", () => {
    // Arrange
    const metaHealth = getMetaHealth({
      check: getLoadFailure("Meta connection check", { message: "timeout" }),
      lastProblem: getLoaded(null),
      notice: { reference: "CWR-AB1-CD2", isStored: true },
    });

    // Act
    const label = getMetaLabel(metaHealth);

    // Assert
    expect(label).toBe("Meta server connection: this part didn't load (reference CWR-AB1-CD2)");
  });
});

describe("getSavedMessage", () => {
  it("warns after saving a container Google can't find", () => {
    // Act
    const message = getSavedMessage({ containerId: "GTM-AB12CD3", status: "not_found" });

    // Assert
    expect(message).toBe("Saved, but Google can't find a published container GTM-AB12CD3. Publish it in Tag Manager (Submit, then Publish) or check the ID. Until then nothing is recorded.");
  });
});
