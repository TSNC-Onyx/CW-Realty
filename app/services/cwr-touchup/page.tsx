import type { Metadata } from "next";

import { BookingForm } from "@/components/forms/booking-form";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PageIntro } from "@/components/ui/page-intro";
import { PhotoPlaceholder } from "@/components/ui/photo-placeholder";
import { Section } from "@/components/ui/section";
import { getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

// Copy adapted from the current live CWR TouchUp page for owner review.

export const metadata: Metadata = {
  title: "CWR TouchUp",
  description: "Make small, smart changes before you list and sell your home for or above market value — nothing due up front.",
};

const STEPS = [
  {
    title: "Tell us about your home",
    body: "Send the request below with a few days and times that work. We'll call or text to confirm a visit.",
  },
  {
    title: "Meet our design specialist",
    body: "A specialist walks through your home and suggests small improvements that can raise your sale price.",
  },
  {
    title: "Choose how involved you want to be",
    body: "Do the work yourself, or let our team manage everything with no upfront cost. Costs are paid from the sale at closing.",
  },
];

const TESTIMONIALS = ["A blessing.", "Take something off your plate and just go for it.", "A godsend."];

export default async function TouchUpPage() {
  const settings = await fetchSiteSettings();
  return (
    <>
      <PageIntro
        eyebrow="Services"
        title="CWR TouchUp"
        lead="Selling “as is” is an option, not a rule. A few small changes can help you sell for or above market value."
      />
      <Section tone="soft" labelledBy="steps-heading">
        <h2 id="steps-heading" className="type-h2">How it works</h2>
        <ol className="mt-6 grid gap-8 md:mt-10 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="border-t-2 border-ink pt-6">
              <p className="type-eyebrow text-muted">{`Step ${index + 1}`}</p>
              <h3 className="type-h3 mt-2">{step.title}</h3>
              <p className="mt-3">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="type-small mt-8 text-muted">CWR TouchUp is available to qualifying homeowners.</p>
      </Section>
      <Section tone="dark" labelledBy="touchup-voices-heading">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6">
            <PhotoPlaceholder ratio="photo" tone="dark" />
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            <Eyebrow tone="dark">What homeowners say</Eyebrow>
            <h2 id="touchup-voices-heading" className="sr-only">What homeowners say</h2>
            <ul className="grid gap-4">
              {TESTIMONIALS.map((quote) => (
                <li key={quote} className="font-display text-menu leading-snug">
                  <q>{quote}</q>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
      <Section id="request" labelledBy="request-heading">
        <h2 id="request-heading" className="type-h2 mb-4">Request a TouchUp visit</h2>
        <p className="mb-8 max-w-prose">We&apos;ll confirm a time with you by phone or text before anyone visits.</p>
        <BookingForm contact={getContactLinks(settings)} />
      </Section>
    </>
  );
}
