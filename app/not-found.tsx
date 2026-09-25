import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button-link";
import { PageIntro } from "@/components/ui/page-intro";
import { Section } from "@/components/ui/section";
import { TextLink } from "@/components/ui/text-link";
import { getAllMenuLinks } from "@/lib/site/navigation";

// Navigation-reconciliation #8: a helpful 404 with the menu and a way to search homes.

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <>
      <PageIntro
        eyebrow="Page not found"
        title="We can't find that page"
        lead="The page may have moved when we rebuilt our website. Try one of these instead, or search for homes."
      >
        <div className="mt-8 flex flex-col items-start gap-2 md:flex-row md:items-center md:gap-6">
          <ButtonLink href="/property-search" size="l" variant="main" isFullWidthOnMobile>
            Search for homes
          </ButtonLink>
          <TextLink href="/" hasArrow>Go to the home page</TextLink>
        </div>
      </PageIntro>
      <Section labelledBy="site-sections-heading">
        <h2 id="site-sections-heading" className="type-h3 mb-6">Popular pages</h2>
        <ul className="grid gap-x-8 gap-y-2 md:grid-cols-3">
          {getAllMenuLinks().map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="flex min-h-11 items-center font-semibold underline underline-offset-4">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
