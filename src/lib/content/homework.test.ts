import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getHomeworkContent, type HomeworkRow } from "@/lib/content/homework";

const BASE_URL = "https://example.supabase.co";
const PDF_MIME = "application/pdf";

function buildRow(overrides: Partial<HomeworkRow>): HomeworkRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "file",
    group_key: "buyers",
    title: "Guide",
    description: "",
    is_spanish: false,
    file_path: "homework/item/upload/guide.pdf",
    file_name: "Guide.pdf",
    file_mime: PDF_MIME,
    file_size_bytes: 1_318_935,
    duration_seconds: null,
    captions_path: null,
    link_url: null,
    photo_path: null,
    photo_alt: null,
    photo_width: null,
    photo_height: null,
    ...overrides,
  };
}

describe("getHomeworkContent", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("orders groups by the approved list and leaves out empty ones", () => {
    // Arrange
    const rows = [buildRow({ group_key: "required" }), buildRow({ group_key: "buyers" })];

    // Act
    const labels = getHomeworkContent(rows).groups.map((group) => group.label);

    // Assert
    expect(labels).toEqual(["For buyers", "Required reading in North Carolina"]);
  });

  it("downloads a stored file under its readable name", () => {
    // Arrange
    const rows = [buildRow({ file_name: "Four basic steps.pdf" })];

    // Act
    const download = getHomeworkContent(rows).groups.at(0)?.downloads.at(0);

    // Assert
    expect(download?.href).toBe(`${BASE_URL}/storage/v1/object/public/cwr-files/homework/item/upload/guide.pdf?download=Four%20basic%20steps.pdf`);
  });

  it("describes a link to another site's PDF by its host", () => {
    // Arrange
    const rows = [buildRow({ kind: "link", group_key: "required", file_path: null, file_name: null, file_mime: null, file_size_bytes: null, link_url: "https://www.ncrec.gov/Brochures/Print/WWREAPrint.pdf" })];

    // Act
    const download = getHomeworkContent(rows).groups.at(0)?.downloads.at(0);

    // Assert
    expect([download?.detailLabel, download?.buttonLabel]).toEqual(["PDF · from ncrec.gov", "Download PDF"]);
  });

  it("shows a video's length and leaves out a video with no file", () => {
    // Arrange
    const rows = [
      buildRow({ kind: "video", group_key: null, file_mime: "video/mp4", duration_seconds: 74 }),
      buildRow({ kind: "video", group_key: null, file_path: null, file_name: null, file_mime: null, file_size_bytes: null }),
    ];

    // Act
    const videos = getHomeworkContent(rows).videos;

    // Assert
    expect(videos.map((video) => video.lengthLabel)).toEqual(["1:14"]);
  });
});
