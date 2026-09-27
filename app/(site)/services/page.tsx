import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SitePhotoImage } from "@/components/content/responsive-photo";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PageIntro } from "@/components/ui/page-intro";
import { Section } from "@/components/ui/section";
import { getSitePhoto, type SitePhoto } from "@/lib/content/site-photos";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { CONTACT_PAGE_PATH, getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

// Services overview at /services (owner choice 2026-09-26, docs/cwr-site-review-round-plan.md Step 5).
// Lists the menu's services only; link-only pages such as seller consulting stay unlisted.

export const metadata: Metadata = {
  title: "Our services",
  description: "CWR TouchUp for sellers and property management for landlords and investors in the Triad, NC.",
};

const CARD_PHOTO_SIZES = "(min-width: 1024px) 640px, (min-width: 768px) 50vw, 100vw";

type ServiceCard = { href: string; audience: string; title: string; body: string; linkLabel: string; photo: SitePhoto };

const SERVICE_CARDS: ServiceCard[] = [
  {
    href: "/services/cwr-touchup",
    audience: "For sellers",
    title: "CWR TouchUp",
    body: "Small, smart changes before you list, so you can sell for or above market value. Nothing due up front.",
    linkLabel: "Explore CWR TouchUp",
    photo: getSitePhoto("touchup-poster"),
  },
  {
    href: "/services/property-management",
    audience: "For landlords and investors",
    title: "Property management",
    body: "Tenant placement, rent collection, repairs, and compliance handled for you across Greensboro, High Point, and Winston-Salem.",
    linkLabel: "Explore property management",
    photo: getSitePhoto("townhomes"),
  },
];

function ServiceCardLink({ card }: { card: ServiceCard }) {
  return (
    <Link href={card.href} className="group block h-full border-t-2 border-ink bg-surface-soft">
      <SitePhotoImage photo={card.photo} sizes={CARD_PHOTO_SIZES} />
      <div className="p-6 md:px-10 md:pt-8 md:pb-10">
        <Eyebrow>{card.audience}</Eyebrow>
        <h3 className="type-h3-card">{card.title}</h3>
        <p className="mt-3">{card.body}</p>
        <span className="text-link mt-2 group-hover:no-underline">
          {card.linkLabel}
          <ArrowRight aria-hidden size={ICON_SIZE.inline} />
        </span>
      </div>
    </Link>
  );
}

function ContactLine({ displayPhone, callHref }: { displayPhone: string | null; callHref: string | null }) {
  const linkClass = "font-semibold underline underline-offset-4";
  return (
    <p className="mt-12">
      {"Not sure which fits? "}
      <Link href={CONTACT_PAGE_PATH} className={linkClass}>Talk with our team</Link>
      {displayPhone && callHref ? (
        <>
          {" or call "}
          <a href={callHref} className={linkClass}>{displayPhone}</a>
        </>
      ) : null}
      .
    </p>
  );
}

export default async function ServicesPage() {
  const contact = getContactLinks(await fetchSiteSettings());
  return (
    <>
      <PageIntro
        eyebrow="Services"
        title="Our services"
        lead="Two ways we help you get more from your property, whether you're getting ready to sell or keeping it as a rental."
      />
      <Section labelledBy="services-heading">
        <h2 id="services-heading" className="sr-only">Services</h2>
        <ul className="grid gap-8 md:grid-cols-2">
          {SERVICE_CARDS.map((card) => (
            <li key={card.href}>
              <ServiceCardLink card={card} />
            </li>
          ))}
        </ul>
        <ContactLine displayPhone={contact?.displayPhone ?? null} callHref={contact?.callHref ?? null} />
      </Section>
    </>
  );
}
