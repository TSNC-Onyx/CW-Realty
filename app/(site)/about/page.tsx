import type { Metadata } from "next";

import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { ButtonLink } from "@/components/ui/button-link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Container, Section } from "@/components/ui/section";
import { fetchTeamMemberBySlug, type TeamMember } from "@/lib/content/team";

// About page on the old site's layout: the owner's portrait beside the welcome
// (owner-approved design and copy, 2026-09-26, docs/cwr-site-review-round-plan.md Step 6).

export const metadata: Metadata = {
  title: "About us",
  description: "Charlie Ward Realty serves Greensboro, High Point, Winston-Salem, and the greater Triad in North Carolina.",
};

const OWNER_SLUG = "charlie-ward";
const OWNER_FALLBACK = { fullName: "Charlie Ward Sr.", jobTitle: "Broker in charge and team leader" };
const PORTRAIT_SIZES = "(min-width: 1024px) 520px, 100vw";

const TRACK_RECORD = [
  { figure: "98%", text: "of the homes we bought for buyers closed below the listing price, giving them instant equity." },
  { figure: "98%", text: "of the sellers we helped sold their home for the listing price, getting its true value." },
];

const JOURNEY_STEPS = ["Financing", "Showings", "Making an offer", "Inspection", "Appraisal", "Securing the title", "Keys at closing"];

// A database problem must not blank the About page: the portrait falls back to its placeholder (Infra §3).
async function fetchOwnerOrNull(): Promise<TeamMember | null> {
  try {
    return await fetchTeamMemberBySlug(OWNER_SLUG);
  } catch (error) {
    console.error("About page owner profile unavailable", error);
    return null;
  }
}

function getOwnerByline(owner: TeamMember | null): string {
  const fullName = owner?.fullName ?? OWNER_FALLBACK.fullName;
  const jobTitle = owner?.jobTitle || OWNER_FALLBACK.jobTitle;
  return `${fullName}, ${jobTitle.charAt(0).toLowerCase()}${jobTitle.slice(1)}`;
}

function WelcomeIntro({ owner }: { owner: TeamMember | null }) {
  return (
    <div className="bg-page pt-12 pb-12 lg:pt-16 lg:pb-24">
      <Container className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <ResponsivePhoto photo={owner?.photo ?? null} ratio="portrait" sizes={PORTRAIT_SIZES} isPriority />
        </div>
        <div className="lg:col-span-7">
          <Eyebrow>About us</Eyebrow>
          <h1 className="type-h1">Welcome to Charlie Ward Realty</h1>
          <p className="type-h2-article mt-6">“Let us show you home.”</p>
          <p className="mt-2 text-base font-semibold text-muted">{getOwnerByline(owner)}</p>
          <p className="type-lead mt-8 max-w-prose">
            We&apos;re a real estate company serving Greensboro, High Point, Winston-Salem, and the greater Triad in North
            Carolina. We live, work, and worship here.
          </p>
        </div>
      </Container>
    </div>
  );
}

function WhoWeAre() {
  return (
    <Section tone="soft" labelledBy="who-heading">
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <Eyebrow>Who we are</Eyebrow>
          <h2 id="who-heading" className="type-h2">Local knowledge, real connections</h2>
        </div>
        <div className="max-w-prose lg:col-span-7">
          <p>
            We know the landscape, and we&apos;ve built valuable business connections that we use to help our clients find
            the right resources.
          </p>
          <p className="mt-4">
            Our mission is to help families and individuals find a home, sell a home, or buy investment property. We make sure
            every home fits both your needs and your budget.
          </p>
        </div>
      </div>
    </Section>
  );
}

function TrackRecord() {
  return (
    <Section labelledBy="track-record-heading">
      <Eyebrow>Our track record</Eyebrow>
      <h2 id="track-record-heading" className="type-h2">Results our clients can count on</h2>
      <ul className="mt-6 grid gap-8 md:mt-10 md:grid-cols-2">
        {TRACK_RECORD.map((item) => (
          <li key={item.text} className="border-t-2 border-ink pt-6">
            <p className="type-display">{item.figure}</p>
            <p className="mt-2 max-w-prose">{item.text}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function HowWeWork() {
  return (
    <Section tone="dark" labelledBy="how-heading">
      <Eyebrow tone="dark">How we work</Eyebrow>
      <h2 id="how-heading" className="type-h2">Personal connections matter most</h2>
      <p className="type-lead mt-4 max-w-prose">
        We get to know your needs, do our research, and stay with you through every step until you have the keys.
      </p>
      <ol className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4 lg:grid-cols-7">
        {JOURNEY_STEPS.map((step, index) => (
          <li key={step} className="border-t-2 border-gold pt-3 text-sm leading-label font-semibold">
            <span className="type-eyebrow block font-bold text-gold">{String(index + 1).padStart(2, "0")}</span>
            {step}
          </li>
        ))}
      </ol>
      <div className="mt-12">
        <ButtonLink href="/contact" size="l" variant="main" tone="dark" isFullWidthOnMobile>
          Talk with our team
        </ButtonLink>
      </div>
    </Section>
  );
}

export default async function AboutPage() {
  const owner = await fetchOwnerOrNull();
  return (
    <>
      <WelcomeIntro owner={owner} />
      <WhoWeAre />
      <TrackRecord />
      <HowWeWork />
    </>
  );
}
