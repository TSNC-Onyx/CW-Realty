import { Phone } from "lucide-react";

import { DesktopNav } from "@/components/layout/desktop-nav";
import { Logo } from "@/components/layout/logo";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { ButtonLink } from "@/components/ui/button-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { CONTACT_PAGE_PATH, type ContactLinks } from "@/lib/site/contact-links";

// Style §11.9: sticky header, 60px on phones and tablets, 88px on desktop.
export function SiteHeader({ contact }: { contact: ContactLinks | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-page">
      <div className="mx-auto flex h-15 max-w-content items-center justify-between gap-6 px-4 lg:h-22 lg:px-16">
        <Logo placement="header" />
        <DesktopNav />
        <div className="hidden items-center gap-4 lg:flex">
          {contact && (
            <a href={contact.callHref} className="flex min-h-11 items-center gap-2 text-base font-semibold">
              <Phone aria-hidden size={ICON_SIZE.inline} />
              {contact.displayPhone}
            </a>
          )}
          <ButtonLink href={CONTACT_PAGE_PATH} size="s" variant="main">
            Contact us
          </ButtonLink>
        </div>
        <MobileMenu contact={contact} />
      </div>
    </header>
  );
}
