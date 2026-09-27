import { describe, expect, it } from "vitest";

import { getShareMetadata, getShareOrigin } from "@/lib/site/share-image";

describe("getShareOrigin", () => {
  it.each([
    ["www.charliewardrealty.com", "https://www.charliewardrealty.com"],
    ["charliewardrealty.com", "https://charliewardrealty.com"],
    ["cw-realty.onyxventuresnc.workers.dev", "https://cw-realty.onyxventuresnc.workers.dev"],
    ["pr-13-cw-realty.onyxventuresnc.workers.dev", "https://pr-13-cw-realty.onyxventuresnc.workers.dev"],
    ["127.0.0.1:3100", "http://127.0.0.1:3100"],
    ["localhost:3000", "http://localhost:3000"],
  ])("uses the requested host %s", (host, expected) => {
    // Arrange
    const requestHost = host;

    // Act
    const origin = getShareOrigin(requestHost);

    // Assert
    expect(origin).toBe(expected);
  });

  it.each([null, "evil.example.com", "cw-realty.onyxventuresnc.workers.dev.evil.com", "xcw-realty.onyxventuresnc.workers.dev"])(
    "falls back to the main address for %s",
    (host) => {
      // Arrange
      const requestHost = host;

      // Act
      const origin = getShareOrigin(requestHost);

      // Assert
      expect(origin).toBe("https://www.charliewardrealty.com");
    },
  );
});

describe("getShareMetadata", () => {
  it("gives link previews the large share image with its size and alt text", () => {
    // Arrange
    const host = "cw-realty.onyxventuresnc.workers.dev";

    // Act
    const metadata = getShareMetadata(host);

    // Assert
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "https://cw-realty.onyxventuresnc.workers.dev/brand/cwr-share.jpg",
        width: 1200,
        height: 630,
        alt: "Charlie Ward Realty logo over a white contemporary farmhouse",
      },
    ]);
  });
});
