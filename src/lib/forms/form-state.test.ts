import { describe, expect, it } from "vitest";

import { getFieldError, getRequestFormState } from "@/lib/forms/form-state";
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

describe("contact form checks", () => {
  it("accepts a complete message and reports that online intake is not open yet", () => {
    // Arrange
    const formData = getFormData(VALID_CONTACT);

    // Act
    const state = getRequestFormState({ schema: contactFormSchema, fields: CONTACT_FORM_FIELDS, formData });

    // Assert
    expect(state).toMatchObject({ status: "unavailable", fieldErrors: {} });
  });

  it("names each field to fix and keeps everything the visitor typed", () => {
    // Arrange
    const formData = getFormData({ ...VALID_CONTACT, email: "jordan@", message: "   " });

    // Act
    const state = getRequestFormState({ schema: contactFormSchema, fields: CONTACT_FORM_FIELDS, formData });

    // Assert
    expect(state).toMatchObject({
      status: "invalid",
      values: { ...VALID_CONTACT, email: "jordan@", message: "   " },
      fieldErrors: {
        email: "Enter a full email address, like name@example.com",
        message: "Tell us how we can help",
      },
    });
  });

  it("treats a missing field as empty instead of failing", () => {
    // Arrange
    const formData = getFormData({ fullName: "Jordan Smith" });

    // Act
    const state = getRequestFormState({ schema: contactFormSchema, fields: CONTACT_FORM_FIELDS, formData });

    // Assert
    expect(Object.keys(state.fieldErrors).sort()).toEqual(["email", "message"]);
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
    const formData = getFormData({ fullName: "Jordan Smith", propertyAddress: "1 Main St", preferredTimes: "Mornings" });

    // Act
    const state = getRequestFormState({ schema: bookingFormSchema, fields: BOOKING_FORM_FIELDS, formData });

    // Assert
    expect(state.fieldErrors).toEqual({ phone: "Enter your phone number" });
  });
});
