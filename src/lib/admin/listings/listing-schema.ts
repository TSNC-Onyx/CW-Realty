import { z } from "zod";

import { getSlug, isValidSlug } from "@/lib/admin/slug";

// Listing rules (Admin §2: photos, price, address, status, description required).

const CENTS_PER_DOLLAR = 100;
const MAX_PRICE_DOLLARS = 1_000_000_000;

const priceSchema = z
  .string()
  .trim()
  .min(1, "Enter the price")
  .transform((value) => value.replace(/[$,\s]/g, ""))
  .refine((value) => /^[0-9]+(\.[0-9]{1,2})?$/.test(value), "Enter the price in dollars, like 225,000")
  .transform((value) => Math.round(Number(value) * CENTS_PER_DOLLAR))
  .refine((cents) => cents > 0 && cents <= MAX_PRICE_DOLLARS * CENTS_PER_DOLLAR, "Enter a price above $0");

function getOptionalNumber({ isWhole, min, max, message }: { isWhole: boolean; min: number; max: number; message: string }) {
  return z
    .string()
    .trim()
    .transform((value) => value.replace(/,/g, ""))
    .refine((value) => value === "" || (isWhole ? /^[0-9]+$/ : /^[0-9]+(\.5|\.0)?$/).test(value), message)
    .transform((value) => (value === "" ? null : Number(value)))
    .refine((value) => value === null || (value >= min && value <= max), message);
}

export const listingSchema = z
  .object({
    streetAddress: z.string().trim().min(1, "Enter the street address").max(200, "Keep the address under 200 characters"),
    city: z.string().trim().min(1, "Enter the city").max(100, "Keep the city under 100 characters"),
    state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use the 2-letter state, like NC"),
    postalCode: z.string().trim().regex(/^[0-9]{5}$/, "Enter a 5-digit ZIP code"),
    price: priceSchema,
    bedrooms: getOptionalNumber({ isWhole: true, min: 0, max: 99, message: "Enter a whole number of bedrooms, or leave blank" }),
    bathrooms: getOptionalNumber({ isWhole: false, min: 0, max: 99, message: "Enter bathrooms like 2 or 2.5, or leave blank" }),
    squareFeet: getOptionalNumber({ isWhole: true, min: 1, max: 10_000_000, message: "Enter square feet as a whole number, or leave blank" }),
    description: z.string().trim().min(1, "Describe the property").max(20000, "Keep the description under 20,000 characters"),
    slug: z.string().trim().toLowerCase(),
  })
  .transform((values) => ({ ...values, slug: values.slug === "" ? getSlug(`${values.streetAddress} ${values.city} ${values.state}`) : values.slug }))
  .refine((values) => isValidSlug(values.slug), { message: "Use lowercase letters, numbers, and dashes", path: ["slug"] });

export type ListingInput = z.infer<typeof listingSchema>;

export function getListingRow(input: ListingInput) {
  return {
    street_address: input.streetAddress,
    city: input.city,
    state: input.state,
    postal_code: input.postalCode,
    price_cents: input.price,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    square_feet: input.squareFeet,
    description: input.description,
    slug: input.slug,
  };
}
