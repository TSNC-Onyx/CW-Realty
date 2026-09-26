import { Download, Handshake } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink, getButtonClassName } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchClosedDeals, type ClosedDeal } from "@/lib/admin/closed-deals/queries";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { GOOGLE_CONVERSION_NAME, getExportableCount } from "@/lib/tracking/offline-export";

// Closed deals and their download files for Google Ads and Meta (Features §3 offline
// conversions; plan decision 11). Owners and managers.

export const metadata: Metadata = { title: "Closed deals" };

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const PRICE_FORMAT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const CENTS_PER_DOLLAR = 100;
const DOWNLOADS = [
  { href: "/admin/closed-deals/download/google-ads", label: "Download for Google Ads" },
  { href: "/admin/closed-deals/download/meta", label: "Download for Meta" },
];

function getDealDetails(deal: ClosedDeal): string {
  const closed = `Closed ${DATE_FORMAT.format(new Date(`${deal.closedOn}T00:00:00Z`))}`;
  const price = deal.valueCents === null ? "" : ` · ${PRICE_FORMAT.format(deal.valueCents / CENTS_PER_DOLLAR)}`;
  const sharing = deal.attribution ? " · included in downloads" : " · not shared (this person did not allow advertising cookies)";
  return `${closed}${price}${sharing}`;
}

function DealList({ deals }: { deals: ClosedDeal[] }) {
  return (
    <ul className="border-b border-line">
      {deals.map((deal) => (
        <li key={deal.id} className="border-t border-line py-4">
          <Link href={`/admin/inbox/${deal.threadId}`} className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
            {deal.contactName}
          </Link>
          <p className="type-small text-muted">{getDealDetails(deal)}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function ClosedDealsPage() {
  const admin = await requireAdminPage(EDITOR_ROLES);
  const deals = await fetchClosedDeals(admin);
  if (deals.length === 0) {
    return (
      <>
        <h1 className="type-h1 mb-8">Closed deals</h1>
        <EmptyState
          icon={Handshake}
          titleId="closed-deals-empty"
          title="No closed deals yet"
          description="When a lead from the website becomes a sale, open their conversation in the inbox and record the closed deal there."
          action={<ButtonLink href="/admin/inbox" size="m" variant="main">Go to the inbox</ButtonLink>}
        />
      </>
    );
  }
  return (
    <>
      <h1 className="type-h1 mb-2">Closed deals</h1>
      <p className="type-lead mb-6 max-w-prose text-muted">Tell Google and Meta which website leads became sales, so they can show your ads to more people like them.</p>
      <section aria-labelledby="downloads-heading" className="mb-10 max-w-prose border-t-2 border-ink pt-6">
        <h2 id="downloads-heading" className="type-h3 mb-2">Download and upload</h2>
        <p className="mb-2">{`${getExportableCount(deals)} of ${deals.length} deals can be shared. Email addresses and phone numbers are scrambled (hashed) before they leave the website.`}</p>
        <ul className="mb-4 list-disc pl-6">
          <li>{`Google Ads: Goals → Conversions → Uploads. Your conversion action must be named exactly "${GOOGLE_CONVERSION_NAME}". Google accepts sales up to 90 days after the ad click.`}</li>
          <li>Meta: Events Manager → your data set → Upload offline events. Meta may ignore sales older than 62 days.</li>
        </ul>
        <div className="flex flex-wrap gap-3">
          {DOWNLOADS.map((download) => (
            <a key={download.href} href={download.href} download className={getButtonClassName({ size: "m", variant: "secondary" })}>
              <Download aria-hidden size={ICON_SIZE.button} />
              {download.label}
            </a>
          ))}
        </div>
      </section>
      <DealList deals={deals} />
    </>
  );
}
