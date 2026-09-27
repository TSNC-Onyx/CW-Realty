import { afterEach, describe, expect, it, vi } from "vitest";

import { getPhotoSources, getSitePhotoSources } from "@/lib/content/media";

const BASE_URL = "https://example.supabase.co";
const FOLDER = "listings/100-main-st/01";

describe("getPhotoSources", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("offers every stored width for a large original", () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);

    // Act
    const sources = getPhotoSources({ folder: FOLDER, originalWidth: 2400 });

    // Assert
    expect(sources?.avifSrcSet).toBe(
      [640, 1280, 1920].map((width) => `${BASE_URL}/storage/v1/object/public/cwr-media/${FOLDER}/${width}.avif ${width}w`).join(", "),
    );
  });

  it("lists a small original once at its real width, never upscaled", () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);

    // Act
    const sources = getPhotoSources({ folder: FOLDER, originalWidth: 576 });

    // Assert
    expect(sources?.webpSrcSet).toBe(`${BASE_URL}/storage/v1/object/public/cwr-media/${FOLDER}/640.webp 576w`);
  });

  it("returns nothing when the site has no database settings", () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    // Act
    const sources = getPhotoSources({ folder: FOLDER, originalWidth: 1600 });

    // Assert
    expect(sources).toBeNull();
  });
});

describe("getSitePhotoSources", () => {
  it("points at the photo folder this site serves", () => {
    // Arrange
    const photo = { folder: "hero-farmhouse", originalWidth: 2400 };

    // Act
    const sources = getSitePhotoSources(photo);

    // Assert
    expect(sources.fallbackSrc).toBe("/images/site/hero-farmhouse/1280.webp");
  });

  it("lists a small original once at its real width", () => {
    // Arrange
    const photo = { folder: "touchup-poster", originalWidth: 1280 };

    // Act
    const sources = getSitePhotoSources(photo);

    // Assert
    expect(sources.avifSrcSet).toBe("/images/site/touchup-poster/640.avif 640w, /images/site/touchup-poster/1280.avif 1280w");
  });
});
