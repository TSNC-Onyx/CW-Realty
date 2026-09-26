import { describe, expect, it } from "vitest";

import { ADMIN_AREAS, ADMIN_AREA_GROUPS, getAreaForPath } from "@/lib/admin/navigation";

describe("getAreaForPath", () => {
  it("finds the area for a page deep inside it", () => {
    // Arrange
    const pathname = "/admin/inbox/7b0c";

    // Act
    const area = getAreaForPath(pathname);

    // Assert
    expect(area?.key).toBe("inbox");
  });

  it("returns nothing for an unknown admin address", () => {
    // Arrange
    const pathname = "/admin/nowhere";

    // Act
    const area = getAreaForPath(pathname);

    // Assert
    expect(area).toBeUndefined();
  });
});

describe("ADMIN_AREAS", () => {
  it("puts every area in a sidebar group", () => {
    // Arrange
    const groupKeys = ADMIN_AREA_GROUPS.map((group) => group.key);

    // Act
    const ungrouped = ADMIN_AREAS.filter((area) => !groupKeys.includes(area.group));

    // Assert
    expect(ungrouped).toEqual([]);
  });
});
