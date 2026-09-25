import { ArrowRight, House, Phone } from "lucide-react";

import { ListingCard } from "@/components/content/listing-card";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { TeamCard } from "@/components/content/team-card";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PhotoPlaceholder } from "@/components/ui/photo-placeholder";
import { Container, Section } from "@/components/ui/section";
import { TextLink } from "@/components/ui/text-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { fetchListingsPage, type Listing, type ListingPhoto } from "@/lib/content/listings";
import { fetchTeamMembers, type TeamMember } from "@/lib/content/team";
import { CONTACT_PAGE_PATH, getContactLinks, type ContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

// Home (desktop-home / mobile-home reference screens).

const FEATURED_LISTING_COUNT = 3;
const FEATURED_TEAM_COUNT = 4;
const HERO_PHOTO_SIZES = "(min-width: 1312px) 1184px, 100vw";
// Smaller originals would look blurry across the full-width hero; the frame shows instead.
const HERO_MIN_PHOTO_WIDTH = 1200;

type HomeContent = { listings: Listing[]; members: TeamMember[] };

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

// The sharpest featured photo fills the hero.
function getHeroPhoto(listings: Listing[]): ListingPhoto | null {
  const photos = listings.flatMap((listing) => listing.photos).filter((photo) => photo.width >= HERO_MIN_PHOTO_WIDTH);
  return photos.reduce<ListingPhoto | null>((widest, photo) => (widest && widest.width >= photo.width ? widest : photo), null);
}

// A database problem must not blank the home page: its sections fall back to their
// empty states and the error is logged (Infra §3).
async function fetchHomeContentOrEmpty(): Promise<HomeContent> {
  try {
    const [{ listings }, members] = await Promise.all([fetchListingsPage(1, FEATURED_LISTING_COUNT), fetchTeamMembers()]);
    return { listings, members: members.slice(0, FEATURED_TEAM_COUNT) };
  } catch (error) {
    console.error("Home page content unavailable", error);
    return { listings: [], members: [] };
  }
}

function HomeHero({ heroPhoto }: { heroPhoto: ListingPhoto | null }) {
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
        <ResponsivePhoto photo={heroPhoto} ratio="hero" sizes={HERO_PHOTO_SIZES} isPriority />
      </div>
    </div>
  );
}

function SectionHeader({ id, eyebrow, title, link }: { id: string; eyebrow: string; title: string; link: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-2 md:mb-10 md:flex-row md:items-end md:justify-between">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={id} className="type-h2">{title}</h2>
      </div>
      <TextLink href={link.href} hasArrow>{link.label}</TextLink>
    </div>
  );
}

function FeaturedListings({ listings, contact }: { listings: Listing[]; contact: ContactLinks | null }) {
  return (
    <Section labelledBy="featured-heading">
      <SectionHeader id="featured-heading" eyebrow="Featured properties" title="Homes we’re proud to show" link={{ href: "/listings", label: "See all listings" }} />
      {listings.length === 0 ? (
        <EmptyState
          icon={House}
          titleId="featured-empty-heading"
          title="No featured listings right now"
          description="New homes appear here as soon as they go live. Call or text us to hear about homes before they're listed."
          action={
            <ButtonLink href={contact?.callHref ?? CONTACT_PAGE_PATH} size="m" variant="main">
              <Phone aria-hidden size={ICON_SIZE.button} />
              {contact ? "Call CWR" : "Contact us"}
            </ButtonLink>
          }
        />
      ) : (
        <ul className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <li key={listing.slug}>
              <ListingCard listing={listing} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function TeamPreview({ members }: { members: TeamMember[] }) {
  if (members.length === 0) return null;
  return (
    <Section labelledBy="team-preview-heading">
      <SectionHeader id="team-preview-heading" eyebrow="CWR team" title="Meet the people behind CWR" link={{ href: "/team", label: "See the full team" }} />
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

export default async function HomePage() {
  const [{ listings, members }, settings] = await Promise.all([fetchHomeContentOrEmpty(), fetchSiteSettings()]);
  return (
    <>
      <HomeHero heroPhoto={getHeroPhoto(listings)} />
      <FeaturedListings listings={listings} contact={getContactLinks(settings)} />
      <TouchUpBand />
      <TeamPreview members={members} />
      <ResourceCards />
    </>
  );
}
