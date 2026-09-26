import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { getGoogleHashedContact, getGoogleNormalizedEmail, getMetaHashedContact, getMetaNormalizedPhone } from "@/lib/tracking/hashing";

function getReferenceHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("email normalization", () => {
  it.each([
    [" Jordan.Smith+homes@Gmail.com ", "jordansmith@gmail.com"],
    ["j.smith@googlemail.com", "jsmith@googlemail.com"],
    ["J.Smith+x@Example.com", "j.smith+x@example.com"],
  ])("Google normalizes %s as %s", (email, expected) => {
    // Arrange / Act
    const normalized = getGoogleNormalizedEmail(email);

    // Assert
    expect(normalized).toBe(expected);
  });
});

describe("hashed contact", () => {
  it("gives Google SHA-256 of the normalized email and the E.164 phone", async () => {
    // Arrange / Act
    const hashed = await getGoogleHashedContact({ email: "Jordan.Smith@gmail.com", phone: "+13365550123" });

    // Assert
    expect(hashed).toEqual({ emailHash: getReferenceHash("jordansmith@gmail.com"), phoneHash: getReferenceHash("+13365550123") });
  });

  it("gives Meta the phone as digits only, country code included", async () => {
    // Arrange / Act
    const hashed = await getMetaHashedContact({ email: null, phone: "+13365550123" });

    // Assert
    expect(hashed).toEqual({ emailHash: null, phoneHash: getReferenceHash(getMetaNormalizedPhone("+13365550123")) });
  });

  it("keeps Gmail dots for Meta, which does not remove them", async () => {
    // Arrange / Act
    const hashed = await getMetaHashedContact({ email: " Jordan.Smith@Gmail.com", phone: null });

    // Assert
    expect(hashed.emailHash).toBe(getReferenceHash("jordan.smith@gmail.com"));
  });
});
