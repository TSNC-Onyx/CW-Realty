import { describe, expect, it } from "vitest";

import { siteSettingsSchema } from "@/lib/admin/contact/site-settings-schema";

const VALID_SETTINGS = {
  phone: "(336) 708-0560",
  textPhone: "",
  email: "charlie@charliewardrealty.com",
  contactNames: "Charlie Ward\nAshley Edwards",
  officeAddressLine1: "806 Green Valley Road",
  officeAddressLine2: "Suite 200",
  officeCity: "Greensboro",
  officeState: "nc",
  officePostalCode: "27408",
  licenseNumber: "c31457",
  footerText: "",
};

describe("contact & footer rules", () => {
  it("stores phones in one format and names as a list", () => {
    // Arrange
    const values = VALID_SETTINGS;

    // Act
    const parsed = siteSettingsSchema.parse(values);

    // Assert
    expect(parsed).toMatchObject({ phone: "+13367080560", textPhone: null, contactNames: ["Charlie Ward", "Ashley Edwards"], officeState: "NC", licenseNumber: "C31457" });
  });

  it("refuses half an office address", () => {
    // Arrange
    const values = { ...VALID_SETTINGS, officeCity: "", officePostalCode: "" };

    // Act
    const result = siteSettingsSchema.safeParse(values);

    // Assert
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0]).sort()).toEqual(["officeCity", "officePostalCode"]);
  });

  it("allows the whole office address to be blank", () => {
    // Arrange
    const values = { ...VALID_SETTINGS, officeAddressLine1: "", officeAddressLine2: "", officeCity: "", officeState: "", officePostalCode: "" };

    // Act
    const result = siteSettingsSchema.safeParse(values);

    // Assert
    expect(result.success).toBe(true);
  });

  it("checks the phone before saving", () => {
    // Arrange
    const values = { ...VALID_SETTINGS, phone: "708-0560" };

    // Act
    const result = siteSettingsSchema.safeParse(values);

    // Assert
    expect(result.success ? "" : result.error.issues[0]?.message).toBe("Enter a 10-digit US phone number, like (336) 555-0123");
  });
});
