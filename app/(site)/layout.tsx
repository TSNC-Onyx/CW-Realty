import { ActionBar } from "@/components/layout/action-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/layout/skip-link";
import { getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

// Public site frame: skip link, header, footer, and the phone Call/Text/Chat bar.
export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await fetchSiteSettings();
  const contact = getContactLinks(settings);
  return (
    <>
      <SkipLink />
      <SiteHeader contact={contact} />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="outline-none">
        {children}
      </main>
      <SiteFooter settings={settings} />
      <ActionBar contact={contact} />
    </>
  );
}
