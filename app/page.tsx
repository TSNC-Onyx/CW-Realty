import { ArrowRight } from "lucide-react";

import { ButtonLink } from "@/components/ui/button-link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PhotoPlaceholder } from "@/components/ui/photo-placeholder";
import { Container, Section } from "@/components/ui/section";
import { TextLink } from "@/components/ui/text-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Home (desktop-home / mobile-home reference screens). Featured properties and the
// team grid join this page in Phase 2, when listings and team members are seeded.

const RESOURCE_CARDS = [
  {
    title: "FAQs & Homework",
    body: "Answers to common buying and selling questions, plus the homework that makes your move easier.",
    href: "/resources",
  },
  {
    title: "Connections",
    body: "Trusted local professionals we refer clients to — loan officers, insurance agents, and more.",
    href: "/connections",
  },
];

function HomeHero() {
  return (
    <div className="bg-page pt-12 lg:pt-24">
      <Container className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-8">
        <div className="lg:col-span-7">
          <Eyebrow>Greensboro &amp; the Triad, NC</Eyebrow>
          <h1 className="type-display">Real estate guidance from people who know the Triad.</h1>
        </div>
        <div className="lg:col-span-4 lg:col-start-9">
          <p className="type-lead">Buy, sell, or get your home ready to list with a local team that answers the phone.</p>
          <div className="mt-6 flex flex-col items-start gap-2">
            <ButtonLink href="/listings" size="l" variant="main" isFullWidthOnMobile>
              View featured listings
              <ArrowRight aria-hidden size={ICON_SIZE.button} />
            </ButtonLink>
            <TextLink href="/contact" hasArrow>
              Talk to an agent
            </TextLink>
          </div>
        </div>
      </Container>
      <div className="mt-10 lg:mx-auto lg:mt-16 lg:max-w-content lg:px-16">
        <PhotoPlaceholder ratio="hero" />
      </div>
    </div>
  );
}

function TouchUpBand() {
  return (
    <Section tone="dark" labelledBy="touchup-heading">
      <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-6">
          <PhotoPlaceholder ratio="photo" tone="dark" />
        </div>
        <div className="lg:col-span-5 lg:col-start-8">
          <Eyebrow tone="dark">CWR TouchUp</Eyebrow>
          <h2 id="touchup-heading" className="type-h2">
            Get your home ready to list.
          </h2>
          <p className="mt-4 text-on-dark-muted">
            A design specialist visits, suggests small fixes that raise your sale price, and our team can handle the work
            with nothing due up front.
          </p>
          <div className="mt-8">
            <ButtonLink href="/services/cwr-touchup#request" size="l" variant="main" tone="dark" isFullWidthOnMobile>
              Request a TouchUp visit
            </ButtonLink>
          </div>
        </div>
      </div>
    </Section>
  );
}

function ResourceCards() {
  return (
    <Section labelledBy="resources-heading">
      <h2 id="resources-heading" className="sr-only">
        Resources
      </h2>
      <ul className="grid gap-8 md:grid-cols-2">
        {RESOURCE_CARDS.map((card) => (
          <li key={card.href} className="border-t-2 border-ink bg-surface-soft p-6 md:p-10">
            <Eyebrow>Resources</Eyebrow>
            <h3 className="type-h3-card">{card.title}</h3>
            <p className="mt-3">{card.body}</p>
            <div className="mt-4">
              <TextLink href={card.href} hasArrow>
                {`Read ${card.title}`}
              </TextLink>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <TouchUpBand />
      <ResourceCards />
    </>
  );
}
