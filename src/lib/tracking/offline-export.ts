import { getGoogleHashedContact, getMetaHashedContact } from "@/lib/tracking/hashing";

// Closed-deal files for manual upload (plan decision 11). Only deals whose lead allowed
// Advertising are included, and email/phone appear only as SHA-256 hashes. No names,
// addresses, or free text are written, so the files carry nothing a spreadsheet could run.

export const GOOGLE_CONVERSION_NAME = "Closed deal";
const OFFICE_TIME_ZONE = "America/New_York";
const CURRENCY = "USD";
const GRANTED = "Granted";
const META_EVENT_NAME = "Purchase";
// Deals have a date, not a time: midday Eastern keeps the date right in every time zone.
const MIDDAY_TIME = "12:00:00";
const MIDDAY_EASTERN_UTC_HOUR = 16;
const CENTS_PER_DOLLAR = 100;

const GOOGLE_HEADERS = ["Google Click ID", "Email", "Phone Number", "Conversion Name", "Conversion Time", "Conversion Value", "Conversion Currency", "Ad User Data", "Ad Personalization"];
const META_HEADERS = ["email", "phone", "event_name", "event_time", "value", "currency", "fbc", "fbp"];

export type ExportDeal = {
  closedOn: string;
  valueCents: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
  attribution: { gclid: string | null; fbc: string | null; fbp: string | null } | null;
};

function getCsvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function getCsvLine(cells: string[]): string {
  return cells.map(getCsvCell).join(",");
}

function getDollars(valueCents: number | null): string {
  return valueCents === null ? "" : (valueCents / CENTS_PER_DOLLAR).toFixed(2);
}

function getMetaEventTime(closedOn: string): string {
  const [year = 0, month = 1, day = 1] = closedOn.split("-").map(Number);
  return String(Date.UTC(year, month - 1, day, MIDDAY_EASTERN_UTC_HOUR) / 1000);
}

function getExportableDeals(deals: ExportDeal[]): ExportDeal[] {
  return deals.filter((deal) => deal.attribution !== null);
}

async function getGoogleLine(deal: ExportDeal): Promise<string | null> {
  const { emailHash, phoneHash } = await getGoogleHashedContact({ email: deal.contactEmail, phone: deal.contactPhone });
  const gclid = deal.attribution?.gclid ?? "";
  if (!gclid && !emailHash && !phoneHash) return null;
  const conversionTime = `${deal.closedOn} ${MIDDAY_TIME}`;
  return getCsvLine([gclid, emailHash ?? "", phoneHash ?? "", GOOGLE_CONVERSION_NAME, conversionTime, getDollars(deal.valueCents), CURRENCY, GRANTED, GRANTED]);
}

async function getMetaLine(deal: ExportDeal): Promise<string | null> {
  const { emailHash, phoneHash } = await getMetaHashedContact({ email: deal.contactEmail, phone: deal.contactPhone });
  const fbc = deal.attribution?.fbc ?? "";
  const fbp = deal.attribution?.fbp ?? "";
  // Meta requires a value on a Purchase, so deals without a sale price are left out of its file.
  if (deal.valueCents === null) return null;
  if (!emailHash && !phoneHash && !fbc && !fbp) return null;
  return getCsvLine([emailHash ?? "", phoneHash ?? "", META_EVENT_NAME, getMetaEventTime(deal.closedOn), getDollars(deal.valueCents), CURRENCY, fbc, fbp]);
}

async function getLines(deals: ExportDeal[], getLine: (deal: ExportDeal) => Promise<string | null>): Promise<string[]> {
  const lines = await Promise.all(getExportableDeals(deals).map(getLine));
  return lines.filter((line): line is string => line !== null);
}

/** Google Ads offline conversion import (click IDs plus enhanced conversions for leads). */
export async function getGoogleAdsCsv(deals: ExportDeal[]): Promise<string> {
  const lines = await getLines(deals, getGoogleLine);
  return [`Parameters:TimeZone=${OFFICE_TIME_ZONE}`, getCsvLine(GOOGLE_HEADERS), ...lines].join("\n") + "\n";
}

/** Meta Events Manager offline event upload (columns are matched during upload). */
export async function getMetaCsv(deals: ExportDeal[]): Promise<string> {
  const lines = await getLines(deals, getMetaLine);
  return [getCsvLine(META_HEADERS), ...lines].join("\n") + "\n";
}

export function getExportableCount(deals: ExportDeal[]): number {
  return getExportableDeals(deals).length;
}
