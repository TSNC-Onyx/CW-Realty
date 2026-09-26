import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { getExportableCount, getGoogleAdsCsv, getMetaCsv, type ExportDeal } from "@/lib/tracking/offline-export";

const CONSENTED_DEAL: ExportDeal = {
  closedOn: "2026-09-20",
  valueCents: 35000000,
  contactEmail: "jordan.smith@gmail.com",
  contactPhone: "+13365550123",
  attribution: { gclid: "Cj0KCQjwabc123", fbc: "fb.1.1727265600000.IwAR1abcdefghij", fbp: null },
};
const UNCONSENTED_DEAL: ExportDeal = { ...CONSENTED_DEAL, contactEmail: "private@example.com", attribution: null };

function getReferenceHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("getGoogleAdsCsv", () => {
  it("follows Google's offline import template with the office time zone", async () => {
    // Arrange / Act
    const csv = await getGoogleAdsCsv([CONSENTED_DEAL]);

    // Assert
    expect(csv.split("\n").slice(0, 2)).toEqual([
      "Parameters:TimeZone=America/New_York",
      "Google Click ID,Email,Phone Number,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Ad User Data,Ad Personalization",
    ]);
  });

  it("writes the click ID, hashed contact, date, and price", async () => {
    // Arrange / Act
    const csv = await getGoogleAdsCsv([CONSENTED_DEAL]);

    // Assert
    expect(csv.split("\n")[2]).toBe(`Cj0KCQjwabc123,${getReferenceHash("jordansmith@gmail.com")},${getReferenceHash("+13365550123")},Closed deal,2026-09-20 12:00:00,350000.00,USD,Granted,Granted`);
  });

  it("never includes a lead who did not allow advertising", async () => {
    // Arrange / Act
    const csv = await getGoogleAdsCsv([UNCONSENTED_DEAL]);

    // Assert
    expect(csv).not.toContain(getReferenceHash("private@example.com"));
  });
});

describe("getMetaCsv", () => {
  it("writes hashed contact, a Purchase at midday Eastern, and the click value", async () => {
    // Arrange / Act
    const csv = await getMetaCsv([CONSENTED_DEAL]);

    // Assert
    expect(csv.split("\n").slice(0, 2)).toEqual([
      "email,phone,event_name,event_time,value,currency,fbc,fbp",
      `${getReferenceHash("jordan.smith@gmail.com")},${getReferenceHash("13365550123")},Purchase,1789920000,350000.00,USD,fb.1.1727265600000.IwAR1abcdefghij,`,
    ]);
  });
});

describe("getMetaCsv without a sale price", () => {
  it("leaves the deal out, because Meta requires a Purchase value", async () => {
    // Arrange / Act
    const csv = await getMetaCsv([{ ...CONSENTED_DEAL, valueCents: null }]);

    // Assert
    expect(csv.trim().split("\n")).toHaveLength(1);
  });
});

describe("getExportableCount", () => {
  it("counts only deals whose lead allowed advertising", () => {
    // Arrange / Act
    const count = getExportableCount([CONSENTED_DEAL, UNCONSENTED_DEAL]);

    // Assert
    expect(count).toBe(1);
  });
});
