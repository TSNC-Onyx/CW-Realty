import { afterEach, describe, expect, it, vi } from "vitest";

import { getPhotoSources } from "@/lib/content/media";

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
