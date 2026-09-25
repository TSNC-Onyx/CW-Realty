import { z } from "zod";

import { getE164Phone } from "@/lib/site/phone";

// Field rules shared by the browser (checks on blur) and the server (Infra §2).
// Messages say exactly what to fix and never blame the visitor (Style §11.12).

const MAX_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 300;
const MAX_SHORT_TEXT_LENGTH = 1000;
const MAX_MESSAGE_LENGTH = 5000;

function getRequiredText(emptyMessage: string, maxLength: number) {
  return z
    .string()
    .trim()
    .min(1, emptyMessage)
    .max(maxLength, `Keep this under ${maxLength} characters`);
}

function getOptionalText(maxLength: number) {
  return z.string().trim().max(maxLength, `Keep this under ${maxLength} characters`);
}

export const fullNameSchema = getRequiredText("Enter your full name", MAX_NAME_LENGTH);

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .pipe(z.email("Enter a full email address, like name@example.com"));

const phoneFormatMessage = "Enter a 10-digit US phone number, like (336) 555-0123";

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Enter your phone number")
  .refine((phone) => getE164Phone(phone) !== null, phoneFormatMessage);

export const optionalPhoneSchema = z
  .string()
  .trim()
  .refine((phone) => phone === "" || getE164Phone(phone) !== null, phoneFormatMessage);

export const optionalEmailSchema = z
  .string()
  .trim()
  .refine((email) => email === "" || z.email().safeParse(email).success, "Enter a full email address, like name@example.com");

export const messageSchema = getRequiredText("Tell us how we can help", MAX_MESSAGE_LENGTH);
export const propertyAddressSchema = getRequiredText("Enter the street address of the home", MAX_ADDRESS_LENGTH);
export const preferredTimesSchema = getRequiredText("Tell us a few days and times that work for you", MAX_SHORT_TEXT_LENGTH);
export const optionalNotesSchema = getOptionalText(MAX_MESSAGE_LENGTH);
