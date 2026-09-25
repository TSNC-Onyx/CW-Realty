import { House, Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { Container } from "@/components/ui/section";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { getContactLinks } from "@/lib/site/contact-links";
import { NC_AGENCY_DISCLOSURE_URL, SITE_FOOTER_ID, getFooterColumns } from "@/lib/site/navigation";
import type { SiteSettings } from "@/lib/site/site-settings";

// Style §11.13 footer: dark band, contact details, five link columns, legal row.

const FIRM_NAME = "Charlie Ward Realty";

const LEGAL_LINKS = [
  { label: "Privacy policy", href: "/privacy-policy" },
  { label: "Cookie settings", href: "/privacy-policy#cookies" },
  { label: "Working with Real Estate Agents (NC)", href: NC_AGENCY_DISCLOSURE_URL },
];

function FooterContact({ settings }: { settings: SiteSettings | null }) {
  const contact = getContactLinks(settings);
  const address = settings?.officeAddress;
  if (!contact) return null;
  return (
    <ul className="mt-6 text-base">
      <li>
        <a href={contact.callHref} className="flex min-h-11 items-center gap-3">
          <Phone aria-hidden size={ICON_SIZE.inline} className="text-gold" />
          {contact.displayPhone}
        </a>
      </li>
      <li>
        <a href={contact.emailHref} className="flex min-h-11 items-center gap-3 break-all">
          <Mail aria-hidden size={ICON_SIZE.inline} className="shrink-0 text-gold" />
          {contact.email}
        </a>
      </li>
      {address && (
        <li className="flex items-start gap-3 py-2.5">
          <MapPin aria-hidden size={ICON_SIZE.inline} className="mt-1 shrink-0 text-gold" />
          <address className="not-italic">
            {[...address.streetLines, address.cityLine].map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
        </li>
      )}
    </ul>
  );
}

function FooterColumns() {
  return (
    <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-5 lg:col-span-8">
      {getFooterColumns().map((column) => (
        <div key={column.heading}>
          <h2 className="type-eyebrow mb-2 text-gold">{column.heading}</h2>
          <ul>
            {column.links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="flex min-h-11 items-center text-base">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function FooterLegal({ licenseNumber }: { licenseNumber: string | null }) {
  const year = new Date().getFullYear();
  const licenseText = licenseNumber ? ` · NC firm license ${licenseNumber}` : "";
  return (
    <div className="mt-10 flex flex-col gap-4 border-t border-divider-dark pt-6 lg:flex-row lg:items-center lg:justify-between">
      <p className="type-small flex items-start gap-2 text-on-dark-muted">
        <House aria-hidden size={ICON_SIZE.inline} className="mt-0.5 shrink-0 text-gold" />
        {`Equal Housing Opportunity · © ${year} ${FIRM_NAME}${licenseText}`}
      </p>
      <ul className="flex flex-col lg:flex-row lg:gap-6">
        {LEGAL_LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="type-small flex min-h-11 items-center text-on-dark-muted underline underline-offset-4">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter({ settings }: { settings: SiteSettings | null }) {
  return (
    <footer id={SITE_FOOTER_ID} className="tone-dark">
      <Container className="pt-12 pb-30 lg:pt-18 lg:pb-10">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo placement="footer" />
            <FooterContact settings={settings} />
          </div>
          <FooterColumns />
        </div>
        <FooterLegal licenseNumber={settings?.licenseNumber ?? null} />
      </Container>
    </footer>
  );
}
