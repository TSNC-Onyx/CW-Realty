// Display text for listing facts (Style §11.10 card details row).

const PRICE_FORMAT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
const CENTS_PER_DOLLAR = 100;

export type ListingFactKind = "beds" | "baths" | "area";

export type ListingFact = { kind: ListingFactKind; label: string };

export type ListingSize = { bedrooms: number | null; bathrooms: number | null; squareFeet: number | null };

export function getDisplayPrice(priceCents: number): string {
  return PRICE_FORMAT.format(priceCents / CENTS_PER_DOLLAR);
}

function getCountLabel(count: number, singular: string, plural: string): string {
  return `${NUMBER_FORMAT.format(count)} ${count === 1 ? singular : plural}`;
}

/** Only the facts a listing has; a commercial property may have no bedrooms. */
export function getListingFacts({ bedrooms, bathrooms, squareFeet }: ListingSize): ListingFact[] {
  const facts: (ListingFact | null)[] = [
    bedrooms === null ? null : { kind: "beds", label: getCountLabel(bedrooms, "bed", "beds") },
    bathrooms === null ? null : { kind: "baths", label: getCountLabel(bathrooms, "bath", "baths") },
    squareFeet === null ? null : { kind: "area", label: `${NUMBER_FORMAT.format(squareFeet)} sq ft` },
  ];
  return facts.filter((fact): fact is ListingFact => fact !== null);
}

/** Splits stored text on blank lines into paragraphs. */
export function getParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
