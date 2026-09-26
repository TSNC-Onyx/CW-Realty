import { z } from "zod";

// "Closed deal" on an inbox conversation (plan decision 11): the closing date and, optionally,
// the sale price, which the ad platforms use as the conversion value.

const EARLIEST_CLOSING_DATE = "2020-01-01";
const MAX_SALE_PRICE_CENTS = 100_000_000_000;
const CENTS_PER_DOLLAR = 100;
const OFFICE_TIME_ZONE = "America/New_York";

/** Today's date in the office's time zone, as YYYY-MM-DD. */
export function getOfficeToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: OFFICE_TIME_ZONE }).format(now);
}

function getSalePriceCents(value: string): number | null {
  const digits = value.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(digits)) return null;
  return Math.round(Number(digits) * CENTS_PER_DOLLAR);
}

export function getClosedDealSchema(now: Date) {
  const today = getOfficeToday(now);
  return z.object({
    closedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the closing date")
      .refine((value) => value >= EARLIEST_CLOSING_DATE, "Enter a closing date after 2020")
      .refine((value) => value <= today, "The closing date can't be in the future"),
    salePrice: z
      .string()
      .trim()
      .transform((value, context) => {
        if (value === "") return null;
        const cents = getSalePriceCents(value);
        if (cents !== null && cents <= MAX_SALE_PRICE_CENTS) return cents;
        context.addIssue({ code: "custom", message: "Enter the sale price in dollars, like 350,000" });
        return z.NEVER;
      }),
  });
}

export type ClosedDealInput = { closedOn: string; salePrice: string };
