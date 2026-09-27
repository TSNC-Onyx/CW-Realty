import { ArrowRight, Phone } from "lucide-react";
import type { Metadata } from "next";

import { ServiceRow, type PhotoSide, type Service } from "@/components/content/service-row";
import { ButtonLink, type Tone } from "@/components/ui/button-link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { getSitePhoto } from "@/lib/content/site-photos";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { CONTACT_PAGE_PATH, getContactLinks, type ContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

// Property Management page (owner-approved design and copy, 2026-09-26,
// docs/cwr-site-review-round-plan.md Step 4).

export const metadata: Metadata = {
  title: "Property management",
  description: "Trusted property management in Greensboro, High Point, and Winston-Salem, NC: tenant placement, rent collection, repairs, and compliance.",
};

const CTA_LABEL = "Get expert property management";

const TRIAD_SERVICES: Service[] = [
  {
    title: "Tenant placement and leasing",
    summary: "Quality tenants, carefully chosen.",
    points: [
      "Marketing on today's leading rental sites, with professional photos that make your property stand out.",
      "Every applicant is screened by the same written standards: credit, background, employment, and rental history.",
      "Professionally prepared leases, signing, and move-in, handled with care and full transparency.",
    ],
    photo: getSitePhoto("pm-family"),
  },
  {
    title: "Rent collection and financial management",
    summary: "Steady income, clear records.",
    points: [
      "On-time rent collection with secure direct deposit to your account.",
      "Consistent, professional follow-up on late payments.",
      "Detailed monthly statements, plus year-end reports that simplify tax time and keep your records audit-ready.",
    ],
    photo: getSitePhoto("pm-rent"),
  },
  {
    title: "Property maintenance and repairs",
    summary: "Problems fixed fast, value protected.",
    points: [
      "24/7 emergency repair coordination to keep disruption to tenants low.",
      "Trusted, licensed, and insured vendors only.",
      "Routine inspections and preventive maintenance that catch problems early and avoid costly repairs.",
    ],
    photo: getSitePhoto("pm-repair"),
  },
];

const OWNER_SERVICES: Service[] = [
  {
    title: "Investor and landlord support",
    summary: "Advice that grows your return.",
    points: [
      "In-depth market analysis to set competitive rent based on current demand and local conditions.",
      "Experienced advice on upgrades that attract tenants and add long-term value.",
      "Clear communication and regular updates, built on transparency and trust.",
    ],
    photo: getSitePhoto("pm-swatches"),
  },
  {
    title: "Legal compliance and risk management",
    summary: "Managed by the book.",
    points: [
      "Careful compliance with federal, state, and local housing laws, including fair housing.",
      "When an eviction can't be avoided, we coordinate it with discretion and follow proper legal procedure.",
    ],
    photo: getSitePhoto("pm-signing"),
  },
];

const LIST_CLASSES: Record<Tone, string> = {
  light: "border-t-2 border-ink divide-y divide-line",
  dark: "border-t-2 border-gold divide-y divide-divider-dark",
};

function getPhotoSide(index: number): PhotoSide {
  return index % 2 === 0 ? "left" : "right";
}

function ServiceList({ services, tone }: { services: Service[]; tone: Tone }) {
  return (
    <ul className={`mt-6 md:mt-10 ${LIST_CLASSES[tone]}`}>
      {services.map((service, index) => (
        <ServiceRow key={service.title} service={service} photoSide={getPhotoSide(index)} tone={tone} />
      ))}
    </ul>
  );
}

function HeroCallLink({ contact }: { contact: ContactLinks | null }) {
  if (!contact) return null;
  return (
    <a href={contact.callHref} className="nav-link-dark flex min-h-11 items-center gap-2 px-2 font-semibold">
      <Phone aria-hidden size={ICON_SIZE.inline} className="text-gold" />
      {`Call ${contact.displayPhone}`}
    </a>
  );
}

function ClosingCallLink({ contact }: { contact: ContactLinks | null }) {
  if (!contact) return null;
  return (
    <a href={contact.callHref} className="text-link">
      {`Or call ${contact.displayPhone}`}
      <ArrowRight aria-hidden size={ICON_SIZE.inline} />
    </a>
  );
}

export default async function PropertyManagementPage() {
  const contact = getContactLinks(await fetchSiteSettings());
  return (
    <>
      <Section tone="texture" labelledBy="pm-heading">
        <Eyebrow tone="dark">Property management</Eyebrow>
        <h1 id="pm-heading" className="type-h1">
          Trusted property management in Greensboro, High Point, and Winston-Salem, NC
        </h1>
        <p className="type-lead mt-6 max-w-prose">
          Owning rental property should feel rewarding, not overwhelming. We protect your investment, place quality tenants,
          and handle the day-to-day, from leasing and rent to repairs and legal compliance, so you can focus on the bigger
          picture.
        </p>
        <div className="mt-10 flex flex-col items-stretch gap-4 md:flex-row md:items-center">
          <ButtonLink href={CONTACT_PAGE_PATH} size="l" variant="main" tone="dark" isFullWidthOnMobile>
            {CTA_LABEL}
            <ArrowRight aria-hidden size={ICON_SIZE.button} />
          </ButtonLink>
          <HeroCallLink contact={contact} />
        </div>
      </Section>
      <Section labelledBy="pm-services-heading">
        <Eyebrow>Our services</Eyebrow>
        <h2 id="pm-services-heading" className="type-h2">Property management services in the Triad</h2>
        <p className="type-lead mt-4 max-w-prose">
          Full-service management that keeps your property cared for, your tenants happy, and your returns on track.
        </p>
        <ServiceList services={TRIAD_SERVICES} tone="light" />
      </Section>
      <Section tone="texture" labelledBy="pm-owner-heading">
        <Eyebrow tone="dark">Owner support</Eyebrow>
        <h2 id="pm-owner-heading" className="type-h2">Guidance and protection for your investment</h2>
        <ServiceList services={OWNER_SERVICES} tone="dark" />
      </Section>
      <Section tone="soft" labelledBy="pm-cta-heading">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <h2 id="pm-cta-heading" className="type-h2">Ready to hand off the day-to-day?</h2>
            <p className="type-lead mt-4 max-w-prose">
              Tell us about your rental property. A property manager will reach out to talk through your goals.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:col-span-5">
            <ButtonLink href={CONTACT_PAGE_PATH} size="l" variant="main" isFullWidthOnMobile>
              {CTA_LABEL}
            </ButtonLink>
            <ClosingCallLink contact={contact} />
          </div>
        </div>
      </Section>
    </>
  );
}
