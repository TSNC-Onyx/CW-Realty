import { describe, expect, it } from "vitest";

import { getDownloadLabel, getDurationLabel, getFileSizeLabel, getUploadProblem } from "@/lib/content/homework-rules";

const PDF_MIME = "application/pdf";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

describe("getUploadProblem", () => {
  it("accepts a PDF guide under the limit", () => {
    // Arrange
    const upload = { purpose: "document" as const, fileName: "Guide.PDF", sizeBytes: 1_300_000 };

    // Act
    const problem = getUploadProblem(upload);

    // Assert
    expect(problem).toBeNull();
  });

  it("refuses a file type that doesn't belong in that slot", () => {
    // Arrange
    const upload = { purpose: "video" as const, fileName: "guide.pdf", sizeBytes: 1_000 };

    // Act
    const problem = getUploadProblem(upload);

    // Assert
    expect(problem).toBe("This file type isn't accepted here. Accepted: MP4 video.");
  });

  it("refuses a video over 50 MB", () => {
    // Arrange
    const upload = { purpose: "video" as const, fileName: "tour.mp4", sizeBytes: 51 * 1024 * 1024 };

    // Act
    const problem = getUploadProblem(upload);

    // Assert
    expect(problem).toBe("This file is larger than 50 MB. Choose a smaller file.");
  });

  it("refuses an empty file", () => {
    // Arrange
    const upload = { purpose: "captions" as const, fileName: "captions.vtt", sizeBytes: 0 };

    // Act
    const problem = getUploadProblem(upload);

    // Assert
    expect(problem).toBe("This file is empty. Choose another file.");
  });
});

describe("labels", () => {
  it("shows sizes the way the approved page does", () => {
    // Arrange
    const sizes = [1_318_935, 678_608, 419_369];

    // Act
    const labels = sizes.map(getFileSizeLabel);

    // Assert
    expect(labels).toEqual(["1.3 MB", "663 KB", "410 KB"]);
  });

  it("shows video length as minutes and seconds", () => {
    // Arrange
    const lengths = [74, 283];

    // Act
    const labels = lengths.map(getDurationLabel);

    // Assert
    expect(labels).toEqual(["1:14", "4:43"]);
  });

  it("words the download button in Spanish for Spanish guides", () => {
    // Arrange
    const guides = [
      { mime: PDF_MIME, isSpanish: false },
      { mime: PPTX_MIME, isSpanish: true },
    ];

    // Act
    const labels = guides.map(getDownloadLabel);

    // Assert
    expect(labels).toEqual(["Download PDF", "Descargar PowerPoint"]);
  });
});
