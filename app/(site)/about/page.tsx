import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button-link";
import { PageIntro } from "@/components/ui/page-intro";
import { Prose } from "@/components/ui/prose";
import { Section } from "@/components/ui/section";

// Copy adapted from the current live About page for owner review.

export const metadata: Metadata = {
  title: "About us",
  description: "Charlie Ward Realty serves Greensboro, High Point, Winston-Salem, and the greater Triad in North Carolina.",
};

const TRACK_RECORD = [
  {
    figure: "98%",
    text: "of the homes we bought for buyers closed below the listing price, giving them equity from day one.",
  },
  { figure: "98%", text: "of the sellers we helped sold their home for the listing price." },
];

export default function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow="About us"
        title="Local people helping you find, sell, or invest in a home"
        lead="Charlie Ward Realty serves Greensboro, High Point, Winston-Salem, and the greater Triad in North Carolina."
      />
      <Section labelledBy="mission-heading">
        <Prose>
          <h2 id="mission-heading">Our mission</h2>
          <p>
            We help families and individuals find a home, sell a home, or buy investment property. We make sure each home
            meets your needs and fits your budget.
          </p>
          <p>
            Our team lives, works, and worships across the Triad. We use that local knowledge and our business connections to
            guide you through every step, from financing to closing day.
          </p>
          <h2>How we work</h2>
          <p>
            We keep it personal. You get a real person who answers the phone, explains each step in plain words, and stays
            with you until you have the keys.
          </p>
        </Prose>
      </Section>
      <Section tone="soft" labelledBy="track-record-heading">
        <h2 id="track-record-heading" className="type-h2">
          Our track record
        </h2>
        <ul className="mt-6 grid gap-8 md:mt-10 md:grid-cols-2">
          {TRACK_RECORD.map((item) => (
            <li key={item.text} className="border-t-2 border-ink pt-6">
              <p className="type-display">{item.figure}</p>
              <p className="mt-2 max-w-prose">{item.text}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10">
          <ButtonLink href="/contact" size="l" variant="main" isFullWidthOnMobile>
            Talk with our team
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}
