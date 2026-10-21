import { describe, expect, it } from "vitest";

import { getSavedMessage, getStatusLines, type TrackingSettingsRow } from "@/lib/admin/tracking/status-lines";

const ROW: TrackingSettingsRow = { gtm_container_id: "GTM-AB12CD3", meta_pixel_id: null, tags_reviewed_at: null };

function getTrackingLabel(status: "published" | "not_found" | "unknown"): string | undefined {
  return getStatusLines({ row: ROW, container: { containerId: "GTM-AB12CD3", status } })[0]?.label;
}

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

describe("getSavedMessage", () => {
  it("warns after saving a container Google can't find", () => {
    // Act
    const message = getSavedMessage({ containerId: "GTM-AB12CD3", status: "not_found" });

    // Assert
    expect(message).toBe("Saved, but Google can't find a published container GTM-AB12CD3. Publish it in Tag Manager (Submit, then Publish) or check the ID. Until then nothing is recorded.");
  });
});
