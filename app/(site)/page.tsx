import { ArrowRight } from "lucide-react";

import { SitePhotoImage } from "@/components/content/responsive-photo";
import { TeamCard } from "@/components/content/team-card";
import { HeroSlideshow } from "@/components/home/hero-slideshow";
import { ButtonLink } from "@/components/ui/button-link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Container, Section } from "@/components/ui/section";
import { TextLink } from "@/components/ui/text-link";
import { getSitePhoto, type SitePhoto, type SitePhotoName } from "@/lib/content/site-photos";
import { fetchTeamMembers, type TeamMember } from "@/lib/content/team";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { CONTACT_PAGE_PATH } from "@/lib/site/contact-links";

// Home, Option C "photo first" (owner-approved design and copy, 2026-09-26,
// docs/cwr-site-review-round-plan.md Step 10).

const FEATURED_TEAM_COUNT = 4;
const HERO_PHOTO_SIZES = "100vw";
const CARD_PHOTO_SIZES = "(min-width: 1024px) 416px, (min-width: 768px) 50vw, 100vw";
const BAND_PHOTO_SIZES = "(min-width: 1024px) 640px, 100vw";
const HERO_PHOTO_NAMES: SitePhotoName[] = ["hero-farmhouse", "hero-living-room", "hero-patio"];

type Path = { title: string; body: string; href: string; linkLabel: string; photo: SitePhoto };

type Review = { quote: string; name: string; detail: string };

const PATHS: Path[] = [
  {
    title: "Find your new home",
    body: "Browse homes across the Triad, and we'll guide you from first showing to closing day.",
    href: "/property-search",
    linkLabel: "Search properties",
    photo: getSitePhoto("home-porch"),
  },
  {
    title: "Sell your home",
    body: "We price it right, market it well, and help you get your home's true value.",
    href: CONTACT_PAGE_PATH,
    linkLabel: "Get a free home evaluation",
    photo: getSitePhoto("home-living-room"),
  },
  {
    title: "Secure investment property",
    body: "Find rentals that perform, then let our property management team handle the rest.",
    href: "/services/property-management",
    linkLabel: "Explore property management",
    photo: getSitePhoto("townhomes"),
  },
];

// Exact words from the reviews on the current site (FTC consumer review rule); only a
// leading ellipsis marks a quote that starts mid-sentence.
const REVIEWS: Review[] = [
  {
    quote: "…I would have priced my house at least $20k under what Charlie ended up selling it for.",
    name: "Julie",
    detail: "High Point, NC",
  },
  {
    quote: "Charlie Ward worked as if we were his only client, and that was priceless.",
    name: "Byron Griffin Sr.",
    detail: "Purchased a home in 2019",
  },
  {
    quote:
      "As veterans, we could not be more satisfied as we were placed with a very knowledgeable representative who also made the VA Loan process seamless.",
    name: "Michelle Lewis",
    detail: "Greensboro, NC",
  },
];

// A database problem must not blank the home page: the team preview is left out and the
// error is logged (Infra §3).
async function fetchFeaturedTeamOrEmpty(): Promise<TeamMember[]> {
  try {
    return (await fetchTeamMembers()).slice(0, FEATURED_TEAM_COUNT);
  } catch (error) {
    console.error("Home page team unavailable", error);
    return [];
  }
}

function HomeHero() {
  const slides = HERO_PHOTO_NAMES.map((name, index) => (
    <SitePhotoImage
      key={name}
      photo={getSitePhoto(name)}
      sizes={HERO_PHOTO_SIZES}
      isPriority={index === 0}
      frameClassName="size-full"
    />
  ));
  return (
    <section aria-labelledby="home-heading" className="relative">
      <HeroSlideshow slides={slides} />
      <div className="tone-dark lg:absolute lg:inset-x-0 lg:bottom-12 lg:bg-transparent">
        <Container>
          <div className="py-8 md:py-10 lg:max-w-hero-panel lg:bg-dark-translucent lg:p-12">
            <Eyebrow tone="dark">Charlie Ward Realty</Eyebrow>
            <h1 id="home-heading" className="type-display">Let us show you home.</h1>
            <p className="type-lead mt-4">
              Find your new home, sell your home, or secure investment property with a local team that&apos;s with you at
              every step.
            </p>
            <div className="mt-8">
              <ButtonLink href={CONTACT_PAGE_PATH} size="l" variant="main" tone="dark" isFullWidthOnMobile>
                Talk to an agent
              </ButtonLink>
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}

function PathCard({ path }: { path: Path }) {
  return (
    <li className="border-t-2 border-ink">
      <SitePhotoImage photo={path.photo} sizes={CARD_PHOTO_SIZES} />
      <h3 className="type-h3 mt-4">{path.title}</h3>
      <p className="mt-2">{path.body}</p>
      <TextLink href={path.href} hasArrow>{path.linkLabel}</TextLink>
    </li>
  );
}

function WhatWeDo() {
  return (
    <Section labelledBy="what-we-do-heading">
      <div className="mb-6 flex flex-col gap-4 md:mb-10 md:flex-row md:items-end md:justify-between">
        <div>
          <Eyebrow>What we do</Eyebrow>
          <h2 id="what-we-do-heading" className="type-h2">You&apos;re in the right place</h2>
        </div>
        <ButtonLink href="/listings" size="l" variant="main" isFullWidthOnMobile>
          View featured listings
          <ArrowRight aria-hidden size={ICON_SIZE.button} />
        </ButtonLink>
      </div>
      <ul className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {PATHS.map((path) => (
          <PathCard key={path.href} path={path} />
        ))}
      </ul>
    </Section>
  );
}

function ClientReviews() {
  return (
    <Section tone="soft" labelledBy="reviews-heading">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <Eyebrow>Happy to share</Eyebrow>
          <h2 id="reviews-heading" className="type-h2">What our clients say</h2>
          <p className="mt-4">Real words from buyers and sellers across the Triad.</p>
        </div>
        <ul className="grid gap-8 lg:col-span-8">
          {REVIEWS.map((review) => (
            <li key={review.name} className="border-t-2 border-ink pt-6">
              <figure>
                <blockquote className="type-quote-review">
                  <p>{`“${review.quote}”`}</p>
                </blockquote>
                <figcaption className="mt-3 font-bold">
                  {review.name} <span className="font-regular text-muted">{`· ${review.detail}`}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function TouchUpBand() {
  return (
    <Section tone="dark" labelledBy="touchup-heading">
      <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-6">
          <SitePhotoImage photo={getSitePhoto("touchup-painter")} sizes={BAND_PHOTO_SIZES} />
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

function TeamPreview({ members }: { members: TeamMember[] }) {
  if (members.length === 0) return null;
  return (
    <Section labelledBy="team-preview-heading">
      <div className="mb-6 flex flex-col gap-2 md:mb-10 md:flex-row md:items-end md:justify-between">
        <div>
          <Eyebrow>CWR team</Eyebrow>
          <h2 id="team-preview-heading" className="type-h2">Meet the people behind Charlie Ward Realty</h2>
        </div>
        <TextLink href="/team" hasArrow>See the full team</TextLink>
      </div>
      <ul className="grid grid-cols-2 gap-4 md:gap-8 lg:grid-cols-4">
        {members.map((member) => (
          <li key={member.slug}>
            <TeamCard member={member} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default async function HomePage() {
  const members = await fetchFeaturedTeamOrEmpty();
  return (
    <>
      <HomeHero />
      <WhatWeDo />
      <ClientReviews />
      <TouchUpBand />
      <TeamPreview members={members} />
    </>
  );
}
