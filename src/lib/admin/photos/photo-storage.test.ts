import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPhotoVariantNames, getVariantFileName } from "@/lib/admin/photos/photo-files";
import { fetchPhotoFilesCheck, getPhotoFilesMessage } from "@/lib/admin/photos/photo-storage";
import { noteProblemCause } from "@/lib/observability/action-context";
import { createServiceClient } from "@/lib/supabase/service-client";

vi.mock("@/lib/supabase/service-client", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/observability/action-context", () => ({ noteProblemCause: vi.fn() }));

const FOLDER = "listings/0b5f3a52-5f0c-4c4e-9a53-3f1f4f6f2d11/7d0e1c9a-2b8f-4a47-9d3e-5b6c7d8e9f01";

type ListReply = { data: { name: string }[] | null; error: { name: string; message: string } | null };

function useStorageList(reply: ListReply): void {
  const storage = { from: () => ({ list: async () => reply }) };
  vi.mocked(createServiceClient).mockReturnValue({ storage } as unknown as ReturnType<typeof createServiceClient>);
}

function getAllFileNames(): { name: string }[] {
  return getPhotoVariantNames().map((variant) => ({ name: getVariantFileName(variant) }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchPhotoFilesCheck", () => {
  it("is complete when every width and format is stored", async () => {
    // Arrange
    useStorageList({ data: getAllFileNames(), error: null });

    // Act
    const check = await fetchPhotoFilesCheck(FOLDER);

    // Assert
    expect(check).toBe("complete");
  });

  it("is incomplete when a file is missing", async () => {
    // Arrange
    useStorageList({ data: getAllFileNames().slice(1), error: null });

    // Act
    const check = await fetchPhotoFilesCheck(FOLDER);

    // Assert
    expect(check).toBe("incomplete");
  });

  it("is unchecked, not incomplete, when storage can't be listed", async () => {
    // Arrange
    useStorageList({ data: null, error: { name: "StorageUnknownError", message: "upstream timeout" } });

    // Act
    const check = await fetchPhotoFilesCheck(FOLDER);

    // Assert
    expect(check).toBe("unchecked");
  });

  it("notes a storage list error as the action's cause", async () => {
    // Arrange
    useStorageList({ data: null, error: { name: "StorageUnknownError", message: "upstream timeout" } });

    // Act
    await fetchPhotoFilesCheck(FOLDER);

    // Assert
    expect(noteProblemCause).toHaveBeenCalledWith({ stage: "storage", severity: "error", code: "StorageUnknownError", detail: "upstream timeout" });
  });
});

describe("getPhotoFilesMessage", () => {
  it.each([
    ["incomplete", "The photo didn't finish uploading. Try again."],
    ["unchecked", "We couldn't check the upload. Try again in a moment."],
  ] as const)("tells the person what happened when the check is %s", (check, expected) => {
    // Act
    const message = getPhotoFilesMessage(check);

    // Assert
    expect(message).toBe(expected);
  });
});
