import { z } from "zod";

import {
  emailSchema,
  fullNameSchema,
  messageSchema,
  optionalEmailSchema,
  optionalNotesSchema,
  optionalPhoneSchema,
  phoneSchema,
  preferredTimesSchema,
  propertyAddressSchema,
} from "@/lib/forms/field-schemas";

// The two public request forms: Contact and CWR TouchUp booking request.
// Field order here is the order shown on the page and in the error summary.

export type FieldKind = "text" | "email" | "tel" | "textarea";

export type FormFieldConfig = {
  name: string;
  label: string;
  kind: FieldKind;
  autoComplete?: string;
  isOptional?: boolean;
  helperText?: string;
};

export const contactFormSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  phone: optionalPhoneSchema,
  message: messageSchema,
});

export const CONTACT_FORM_FIELDS: FormFieldConfig[] = [
  { name: "fullName", label: "Full name", kind: "text", autoComplete: "name" },
  { name: "email", label: "Email", kind: "email", autoComplete: "email" },
  {
    name: "phone",
    label: "Phone",
    kind: "tel",
    autoComplete: "tel-national",
    isOptional: true,
    helperText: "We'll only call or text about your request.",
  },
  { name: "message", label: "How can we help?", kind: "textarea" },
];

export const bookingFormSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
  email: optionalEmailSchema,
  propertyAddress: propertyAddressSchema,
  preferredTimes: preferredTimesSchema,
  notes: optionalNotesSchema,
});

export const BOOKING_FORM_FIELDS: FormFieldConfig[] = [
  { name: "fullName", label: "Full name", kind: "text", autoComplete: "name" },
  {
    name: "phone",
    label: "Phone",
    kind: "tel",
    autoComplete: "tel-national",
    helperText: "We'll call or text to confirm your visit.",
  },
  { name: "email", label: "Email", kind: "email", autoComplete: "email", isOptional: true },
  { name: "propertyAddress", label: "Home address", kind: "text", autoComplete: "street-address" },
  {
    name: "preferredTimes",
    label: "Days and times that work for you",
    kind: "textarea",
    helperText: "For example: weekday mornings, or Saturday after 1 pm.",
  },
  { name: "notes", label: "Anything we should know?", kind: "textarea", isOptional: true },
];
