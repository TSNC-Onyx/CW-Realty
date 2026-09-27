import type { Metadata } from "next";

import { BookingForm } from "@/components/forms/booking-form";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { getSitePhotoSources } from "@/lib/content/media";
import { getSitePhoto } from "@/lib/content/site-photos";
import { getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

// CWR TouchUp on the old site's layout: intro, video, customer quotes, then the steps beside
// the request form (owner-approved design and copy, 2026-09-26, docs/cwr-site-review-round-plan.md Step 9).

export const metadata: Metadata = {
  title: "CWR TouchUp",
  description: "Make small, smart changes before you list and sell your home for or above market value — nothing due up front.",
};

const VIDEO_SOURCE = "/video/cwr-touchup.mp4";

const STEPS = [
  {
    title: "Tell us about your home",
    body: "Share your contact details and let us know you'd like to get more from your sale.",
  },
  {
    title: "Meet our design specialist",
    body: "We'll visit and suggest improvements that can raise your sale price.",
  },
  {
    title: "Choose your level of help",
    body: "Handle the work yourself, or relax while we take care of everything. You pay nothing up front; we deduct the cost at closing.",
  },
];

const TESTIMONIALS = ["A blessing.", "Take something off your plate and just go for it.", "A godsend."];

function TouchUpVideo() {
  const poster = getSitePhoto("touchup-poster");
  const posterSource = getSitePhotoSources({ folder: poster.folder, originalWidth: poster.width }).fallbackSrc;
  return (
    <figure className="mt-12 max-w-video">
      <video
        controls
        preload="none"
        playsInline
        poster={posterSource}
        width={poster.width}
        height={poster.height}
        aria-label="CWR TouchUp video"
        className="block aspect-video w-full bg-photo-placeholder-dark object-cover"
      >
        <source src={VIDEO_SOURCE} type="video/mp4" />
      </video>
    </figure>
  );
}

function Steps() {
  return (
    <div>
      <Eyebrow>How it works</Eyebrow>
      <h2 id="steps-heading" className="type-h2">Three steps to a better sale</h2>
      <ol className="mt-8">
        {STEPS.map((step, index) => (
          <li key={step.title} className="grid grid-cols-[auto_1fr] gap-6 border-t border-line py-6">
            <span aria-hidden className="type-h3 flex size-16 items-center justify-center rounded-full bg-dark text-gold">
              {index + 1}
            </span>
            <div>
              <h3 className="type-h3">
                <span className="sr-only">{`Step ${index + 1}: `}</span>
                {step.title}
              </h3>
              <p className="mt-2">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="type-small mt-4 text-muted">CWR TouchUp is available to qualifying homeowners.</p>
    </div>
  );
}

export default async function TouchUpPage() {
  const settings = await fetchSiteSettings();
  return (
    <>
      <Section labelledBy="touchup-heading">
        <Eyebrow>Home selling tip #1</Eyebrow>
        <h1 id="touchup-heading" className="type-h1">CWR TouchUp</h1>
        <p className="type-lead mt-4 max-w-prose">
          Selling “as is” isn&apos;t a rule, it&apos;s an option. Make a few small changes and sell your home for or above
          market value. CWR TouchUp is available to homeowners who qualify.
        </p>
        <TouchUpVideo />
      </Section>
      <Section tone="dark" labelledBy="touchup-voices-heading">
        <Eyebrow tone="dark">What homeowners say</Eyebrow>
        <h2 id="touchup-voices-heading" className="type-h2">We call it a game changer. Here&apos;s what our customers say.</h2>
        <ul className="mt-10 grid gap-8 md:grid-cols-3">
          {TESTIMONIALS.map((quote) => (
            <li key={quote} className="border-t-2 border-gold pt-6">
              <blockquote className="type-quote">
                <p>{`“${quote}”`}</p>
              </blockquote>
            </li>
          ))}
        </ul>
      </Section>
      <Section tone="soft" id="request" labelledBy="steps-heading">
        <div className="grid items-start gap-12 md:grid-cols-2 lg:gap-16">
          <Steps />
          <div className="border-t-2 border-ink bg-surface p-6 md:p-10">
            <h2 id="request-heading" className="type-h3 mb-6">Request a TouchUp visit</h2>
            <BookingForm contact={getContactLinks(settings)} />
          </div>
        </div>
      </Section>
    </>
  );
}
