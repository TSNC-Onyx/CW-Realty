import { ArrowDown, Check, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AddOnList } from "@/components/content/add-on-list";
import { PlanCard } from "@/components/content/plan-card";
import { PlanCarousel, type CarouselPlan } from "@/components/content/plan-carousel";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { ContactForm } from "@/components/forms/contact-form";
import { getButtonClassName } from "@/components/ui/button-link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Container, Section } from "@/components/ui/section";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { AGREEMENT_POINTS, DIRECT_LINE, PLAN_SECTIONS, getListPrice, type PlanSection } from "@/lib/content/selected-services";
import { fetchTeamMemberBySlug, type TeamMember } from "@/lib/content/team";
import { getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

// Selected services (owner choices 2026-09-30 → 2026-10-02, docs/cwr-selected-services-plan.md):
// Buyer and Seller plans from the owner's deck, Charlie's direct line, and the contact form.
// Plans are a carousel below 1024px (version B) and a grid from 1024px.

const BROKER_SLUG = "charlie-ward";
// Shown when team data can't load, so the page never loses the broker's name.
const BROKER_FALLBACK = { fullName: "Charlie Ward Sr.", jobTitle: "Broker in charge and team leader" };
const PORTRAIT_SIZES = "(min-width: 1024px) 368px, (min-width: 768px) 40vw, 112px";
const BUTTON_ROW_CLASSES = "w-full xl:w-auto";

export const metadata: Metadata = {
  title: "Selected services",
  description: "Pick the real estate help you need from Charlie Ward Realty: buyer and seller plans with clear prices.",
};

// A team-data problem must not blank the page: the intro shows the broker without a photo (Infra §3).
async function fetchBrokerOrNull(): Promise<TeamMember | null> {
  try {
    return await fetchTeamMemberBySlug(BROKER_SLUG);
  } catch (error) {
    console.error("Broker profile unavailable", error);
    return null;
  }
}

function BrokerByline({ broker }: { broker: TeamMember | null }) {
  return (
    <div className="profile-byline grid items-center gap-4 md:grid-cols-1 md:items-start md:gap-3">
      <ResponsivePhoto photo={broker?.photo ?? null} ratio="portrait" shape="arch" sizes={PORTRAIT_SIZES} isPriority />
      <div>
        <Link href={`/team/${BROKER_SLUG}`} className="type-team-name inline-flex min-h-11 items-center underline-offset-4 hover:underline">
          {broker?.fullName ?? BROKER_FALLBACK.fullName}
        </Link>
        <p className="text-base text-muted">{broker?.jobTitle ?? BROKER_FALLBACK.jobTitle}</p>
        <a className="text-link" href={DIRECT_LINE.href} aria-label={`Call Charlie's direct line, ${DIRECT_LINE.display}`}>
          <Phone aria-hidden size={ICON_SIZE.inline} className="shrink-0" />
          {`Direct: ${DIRECT_LINE.display}`}
        </a>
      </div>
    </div>
  );
}

function IntroText() {
  return (
    <>
      <Eyebrow>Services</Eyebrow>
      <h1 className="type-h1 max-w-prose">Selected services</h1>
      <p className="type-lead mt-4 max-w-prose">Pick the real estate help you need, and pay only for that.</p>
      <p className="mt-4 max-w-prose">
        At Charlie Ward Realty, buyers and sellers can now choose a service plan that cuts costs and still gives you expert support. Buying your first home or selling for top value, you&apos;re in control of your experience and your budget.
      </p>
      <div className="mt-8 flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-center">
        <Link href="#request" className={`${getButtonClassName({ size: "l", variant: "main" })} ${BUTTON_ROW_CLASSES}`}>Get started</Link>
        {PLAN_SECTIONS.map((section) => (
          <Link key={section.id} href={`#${section.id}`} className={`${getButtonClassName({ size: "m", variant: "secondary" })} ${BUTTON_ROW_CLASSES}`}>
            {`See ${section.heading.toLowerCase()}`}
            <ArrowDown aria-hidden size={ICON_SIZE.button} className="shrink-0" />
          </Link>
        ))}
      </div>
    </>
  );
}

// Text and portrait share a top edge from 768px; on phones the portrait follows as a byline.
function Intro({ broker }: { broker: TeamMember | null }) {
  return (
    <div className="bg-page pt-12 pb-6 lg:pt-24 lg:pb-10">
      <Container>
        <div className="grid gap-10 md:grid-cols-12 md:items-start lg:gap-16">
          <div className="md:order-2 md:col-span-7 xl:col-span-8">
            <IntroText />
          </div>
          <div className="md:col-span-5 xl:col-span-4">
            <BrokerByline broker={broker} />
          </div>
        </div>
      </Container>
    </div>
  );
}

function getCarouselPlans(section: PlanSection): CarouselPlan[] {
  return section.plans.map((plan) => ({ slug: plan.slug, name: plan.name, listPrice: getListPrice(plan), isRecommended: plan.tone === "dark", isWide: plan.isWide ?? false }));
}

// Plan sections after the first share the page background, so they follow on instead of doubling the padding.
function PlansSection({ section, isFollowOn }: { section: PlanSection; isFollowOn: boolean }) {
  const headingId = `${section.id}-heading`;
  return (
    <Section id={section.id} labelledBy={headingId} isFollowOn={isFollowOn}>
      <h2 id={headingId} className="type-h2 mb-4">{section.heading}</h2>
      <p className="mb-6 max-w-prose md:mb-10">{section.lead}</p>
      <PlanCarousel
        sectionId={section.id}
        label={section.heading}
        plans={getCarouselPlans(section)}
        cards={section.plans.map((plan) => <PlanCard key={plan.slug} plan={plan} audience={section.audience} />)}
      />
      <AddOnList headingId={`${section.audience}-add-ons`} note={section.addOnsNote} addOns={section.addOns} />
    </Section>
  );
}

function AgreementNote() {
  return (
    <section aria-labelledby="how-heading" className="bg-page pb-12 lg:pb-24">
      <Container>
        <div className="max-w-prose border-t-2 border-ink pt-6">
          <h2 id="how-heading" className="type-h3">How every plan works</h2>
          <ul className="mt-4 grid gap-3">
            {AGREEMENT_POINTS.map((point) => (
              <li key={point} className="flex gap-3">
                <Check aria-hidden size={ICON_SIZE.inline} className="mt-1.5 shrink-0 text-ink" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

export default async function SelectedServicesPage() {
  const [broker, settings] = await Promise.all([fetchBrokerOrNull(), fetchSiteSettings()]);
  return (
    <>
      <Intro broker={broker} />
      {PLAN_SECTIONS.map((section, index) => <PlansSection key={section.id} section={section} isFollowOn={index > 0} />)}
      <AgreementNote />
      <Section tone="soft" id="request" labelledBy="request-heading">
        <h2 id="request-heading" className="type-h2 mb-4">Get started</h2>
        <p className="mb-8 max-w-prose">Tell us whether you&apos;re buying or selling and which plan interests you. A broker will get back to you within one business day.</p>
        <ContactForm contact={getContactLinks(settings)} />
      </Section>
    </>
  );
}
