import type { Metadata } from "next";

import { Eyebrow } from "@/components/ui/eyebrow";
import { PageIntro } from "@/components/ui/page-intro";
import { Section } from "@/components/ui/section";
import { TextLink } from "@/components/ui/text-link";
import { NC_AGENCY_DISCLOSURE_URL } from "@/lib/site/navigation";

// Topics from the current live "Homework" page. The guides themselves are shared on
// request until the owner supplies files to publish here.

export const metadata: Metadata = {
  title: "FAQs & Homework",
  description: "Guides for buying and selling a home in the Triad, from Charlie Ward Realty.",
};

type ResourceTopic = { audience: string; title: string; body: string; linkLabel: string; href: string };

const ASK_FOR_GUIDE_PATH = "/contact";

const TOPICS: ResourceTopic[] = [
  {
    audience: "For buyers",
    title: "Four basic steps in buying a home",
    body: "The path from pre-approval to closing day, one step at a time.",
    linkLabel: "Ask for the buying guide",
    href: ASK_FOR_GUIDE_PATH,
  },
  {
    audience: "For buyers",
    title: "Do the math",
    body: "Work out what you can comfortably spend before you start touring homes.",
    linkLabel: "Ask for the budget worksheet",
    href: ASK_FOR_GUIDE_PATH,
  },
  {
    audience: "For buyers",
    title: "Buyers working with real estate agents",
    body: "What a buyer's agent does for you and how the relationship works in North Carolina.",
    linkLabel: "Ask for the buyer guide",
    href: ASK_FOR_GUIDE_PATH,
  },
  {
    audience: "For sellers",
    title: "Listing with CWR",
    body: "How we price, market, and show your home, and what we ask of you along the way.",
    linkLabel: "Ask for the listing guide",
    href: ASK_FOR_GUIDE_PATH,
  },
  {
    audience: "For sellers",
    title: "Video and showing prep",
    body: "Simple ways to get each room ready for photos, video, and showings.",
    linkLabel: "Ask for the showing checklist",
    href: ASK_FOR_GUIDE_PATH,
  },
  {
    audience: "For sellers",
    title: "CWR TouchUp",
    body: "Small changes before you list that can raise your sale price, with nothing due up front.",
    linkLabel: "Learn about CWR TouchUp",
    href: "/services/cwr-touchup",
  },
  {
    audience: "Para vendedores",
    title: "Vender su casa",
    body: "Información en español para vender su casa con CWR.",
    linkLabel: "Pida la guía en español",
    href: ASK_FOR_GUIDE_PATH,
  },
  {
    audience: "Required reading",
    title: "Working with real estate agents",
    body: "The North Carolina Real Estate Commission's guide to how agents work for buyers and sellers.",
    linkLabel: "Read the NC Real Estate Commission guide",
    href: NC_AGENCY_DISCLOSURE_URL,
  },
];

export default function ResourcesPage() {
  return (
    <>
      <PageIntro
        eyebrow="FAQs & Homework"
        title="Homework"
        lead="Short guides that answer the questions buyers and sellers ask us most. Ask for any guide and we'll send it to you."
      />
      <Section labelledBy="topics-heading">
        <h2 id="topics-heading" className="sr-only">Guides</h2>
        <ul className="grid gap-8 md:grid-cols-2">
          {TOPICS.map((topic) => (
            <li key={topic.title} lang={topic.audience === "Para vendedores" ? "es" : undefined} className="border-t-2 border-ink bg-surface-soft p-6 md:p-10">
              <Eyebrow>{topic.audience}</Eyebrow>
              <h3 className="type-h3-card">{topic.title}</h3>
              <p className="mt-3">{topic.body}</p>
              <div className="mt-4">
                <TextLink href={topic.href} hasArrow>{topic.linkLabel}</TextLink>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
