import { ChatLauncher } from "@/components/chat/chat-launcher";
import { VisitorProblemReporter } from "@/components/content/visitor-problem-reporter";
import { ActionBar } from "@/components/layout/action-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/layout/skip-link";
import { Tracking } from "@/components/tracking/tracking";
import { getContactLinks } from "@/lib/site/contact-links";
import { getMenuSections } from "@/lib/site/navigation";
import { fetchPageListing } from "@/lib/site/page-listing";
import { fetchSiteSettings } from "@/lib/site/site-settings";

// Public site frame: skip link, header, footer, the phone Call/Text/Chat bar, the chat
// assistant launcher (its panel loads only when opened), the cookie choices (Phase 6), and
// the error watcher (docs/error-logging-a-grade-plan.md, Phase B).
export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [settings, listing] = await Promise.all([fetchSiteSettings(), fetchPageListing()]);
  const contact = getContactLinks(settings);
  const menuSections = getMenuSections(listing);
  return (
    <>
      <VisitorProblemReporter />
      <SkipLink />
      {/* Early in the page so keyboard users reach the cookie choices right after the skip link. */}
      <Tracking />
      <SiteHeader contact={contact} menuSections={menuSections} />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SiteFooter settings={settings} listing={listing} />
      <ActionBar contact={contact} />
      <ChatLauncher contact={contact} />
    </>
  );
}
