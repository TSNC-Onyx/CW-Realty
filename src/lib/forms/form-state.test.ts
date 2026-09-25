import { describe, expect, it } from "vitest";

import { getFieldError, getFieldErrors, getFieldValues } from "@/lib/forms/form-state";
import { BOOKING_FORM_FIELDS, CONTACT_FORM_FIELDS, bookingFormSchema, contactFormSchema } from "@/lib/forms/request-forms";

function getFormData(values: Record<string, string>): FormData {
  const formData = new FormData();
  Object.entries(values).forEach(([name, value]) => formData.set(name, value));
  return formData;
}

const VALID_CONTACT = {
  fullName: "Jordan Smith",
  email: "jordan@example.com",
  phone: "",
  message: "I'd like to see 1514 Woodridge Ave.",
};

function getErrorsFor(schema: typeof contactFormSchema | typeof bookingFormSchema, fields: typeof CONTACT_FORM_FIELDS, values: Record<string, string>) {
  return getFieldErrors(schema, getFieldValues(getFormData(values), fields));
}

describe("contact form checks", () => {
  it("accepts a complete message", () => {
    // Arrange
    const values = VALID_CONTACT;

    // Act
    const errors = getErrorsFor(contactFormSchema, CONTACT_FORM_FIELDS, values);

    // Assert
    expect(errors).toEqual({});
  });

  it("names each field to fix", () => {
    // Arrange
    const values = { ...VALID_CONTACT, email: "jordan@", message: "   " };

    // Act
    const errors = getErrorsFor(contactFormSchema, CONTACT_FORM_FIELDS, values);

    // Assert
    expect(errors).toEqual({ email: "Enter a full email address, like name@example.com", message: "Tell us how we can help" });
  });

  it("treats a missing field as empty instead of failing", () => {
    // Arrange
    const values = { fullName: "Jordan Smith" };

    // Act
    const errors = getErrorsFor(contactFormSchema, CONTACT_FORM_FIELDS, values);

    // Assert
    expect(Object.keys(errors).sort()).toEqual(["email", "message"]);
  });

  it("allows the optional phone to be blank but not malformed", () => {
    // Arrange
    const values = ["", "336-708-05"];

    // Act
    const errors = values.map((value) => getFieldError(contactFormSchema, "phone", value));

    // Assert
    expect(errors).toEqual([null, "Enter a 10-digit US phone number, like (336) 555-0123"]);
  });
});

describe("TouchUp request checks", () => {
  it("requires a phone number so staff can confirm the visit", () => {
    // Arrange
    const values = { fullName: "Jordan Smith", propertyAddress: "1 Main St", preferredTimes: "Mornings" };

    // Act
    const errors = getErrorsFor(bookingFormSchema, BOOKING_FORM_FIELDS, values);

    // Assert
    expect(errors).toEqual({ phone: "Enter your phone number" });
  });
});
