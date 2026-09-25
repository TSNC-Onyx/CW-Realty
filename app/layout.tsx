import type { Metadata } from "next";
import { connection } from "next/server";

import { ActionBar } from "@/components/layout/action-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/layout/skip-link";
import { FONT_VARIABLE_CLASSES } from "@/lib/design/fonts";
import { getContactLinks } from "@/lib/site/contact-links";
import { SITE_URL } from "@/lib/site/navigation";
import { fetchSiteSettings } from "@/lib/site/site-settings";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Charlie Ward Realty", template: "%s | Charlie Ward Realty" },
  description: "Charlie Ward Realty — Greensboro and the Triad, North Carolina.",
};

// The strict CSP uses a per-request nonce, which requires dynamic rendering.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const settings = await fetchSiteSettings();
  const contact = getContactLinks(settings);
  return (
    <html lang="en" className={FONT_VARIABLE_CLASSES}>
      <body>
        <SkipLink />
        <SiteHeader contact={contact} />
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="outline-none">
          {children}
        </main>
        <SiteFooter settings={settings} />
        <ActionBar contact={contact} />
      </body>
    </html>
  );
}
