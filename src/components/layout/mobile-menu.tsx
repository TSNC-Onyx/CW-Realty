"use client";

import { ChevronDown, ChevronRight, Menu, MessageSquare, Phone, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type MouseEvent } from "react";

import { getButtonClassName } from "@/components/ui/button-link";
import { Logo } from "@/components/layout/logo";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { CONTACT_PAGE_PATH, type ContactLinks } from "@/lib/site/contact-links";
import { MENU_SECTIONS, SITE_FOOTER_ID, isCurrentPath, isCurrentSection, type NavLink, type NavSection } from "@/lib/site/navigation";

// Style §11.9 mobile menu. A native modal <dialog> traps focus, closes on Escape,
// and returns focus to the Menu button; sub-pages open with native <details>.

const ROW_CLASS = "flex h-14 w-full items-center justify-between border-b border-divider-menu px-4 font-display text-menu font-medium";
const CURRENT_ROW_CLASS = "border-l-4 border-l-gold bg-dark-alt";

type NavigateProps = { pathname: string; onNavigate: () => void };

function getRowClassName(isCurrent: boolean): string {
  return isCurrent ? `${ROW_CLASS} ${CURRENT_ROW_CLASS}` : ROW_CLASS;
}

function SubPageLink({ link, pathname, onNavigate }: NavigateProps & { link: NavLink }) {
  const isCurrent = isCurrentPath(pathname, link.href);
  return (
    <li>
      <Link
        href={link.href}
        onClick={onNavigate}
        aria-current={isCurrent ? "page" : undefined}
        className={`flex min-h-11 items-center pl-8 text-md underline-offset-4 ${isCurrent ? "font-bold underline" : ""}`}
      >
        {link.label}
      </Link>
    </li>
  );
}

function MenuSection({ section, pathname, onNavigate }: NavigateProps & { section: NavSection }) {
  const isCurrent = isCurrentSection(pathname, section);
  if (section.kind === "link") {
    return (
      <li>
        <Link href={section.href} onClick={onNavigate} aria-current={isCurrent ? "page" : undefined} className={getRowClassName(isCurrent)}>
          {section.label}
          <ChevronRight aria-hidden size={ICON_SIZE.chevron} />
        </Link>
      </li>
    );
  }
  return (
    <li>
      <details open={isCurrent} className="group">
        <summary className={`${getRowClassName(isCurrent)} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          {section.label}
          <ChevronDown aria-hidden size={ICON_SIZE.chevron} className="transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <ul className="border-b border-divider-menu py-2">
          {section.links.map((link) => (
            <SubPageLink key={link.href} link={link} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function ContactButtons({ contact, onNavigate }: { contact: ContactLinks | null; onNavigate: () => void }) {
  return (
    <div className="grid shrink-0 gap-3 p-4">
      <Link href={contact?.callHref ?? CONTACT_PAGE_PATH} onClick={onNavigate} className={getButtonClassName({ size: "l", variant: "main", tone: "dark" })}>
        <Phone aria-hidden size={ICON_SIZE.button} />
        {contact ? `Call ${contact.displayPhone}` : "Contact us"}
      </Link>
      {contact && (
        <Link href={contact.textHref} onClick={onNavigate} className={getButtonClassName({ size: "l", variant: "secondary", tone: "dark" })}>
          <MessageSquare aria-hidden size={ICON_SIZE.button} />
          Text us
        </Link>
      )}
    </div>
  );
}

export function MobileMenu({ contact }: { contact: ContactLinks | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  // Without JavaScript the link jumps to the footer menu; with it, the dialog opens.
  const handleOpen = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    dialogRef.current?.showModal();
  };
  const handleClose = () => dialogRef.current?.close();

  return (
    <>
      <a
        href={`#${SITE_FOOTER_ID}`}
        aria-haspopup="dialog"
        onClick={handleOpen}
        className={`${getButtonClassName({ size: "s", variant: "secondary" })} px-3 lg:hidden`}
      >
        <Menu aria-hidden size={ICON_SIZE.button} />
        Menu
      </a>
      <dialog ref={dialogRef} aria-label="Menu" className="menu-dialog tone-dark m-0 h-dvh max-h-none w-full max-w-none border-0 p-0 lg:hidden">
        <div className="flex h-full flex-col">
          <div className="flex h-15 shrink-0 items-center justify-between border-b border-divider-menu px-4">
            <Logo placement="header" onNavigate={handleClose} />
            <button type="button" onClick={handleClose} className={getButtonClassName({ size: "s", variant: "secondary", tone: "dark" })}>
              <X aria-hidden size={ICON_SIZE.button} />
              Close
            </button>
          </div>
          <nav aria-label="Main" className="flex-1 overflow-y-auto">
            <ul>
              {MENU_SECTIONS.map((section) => (
                <MenuSection key={section.label} section={section} pathname={pathname} onNavigate={handleClose} />
              ))}
            </ul>
          </nav>
          <ContactButtons contact={contact} onNavigate={handleClose} />
        </div>
      </dialog>
    </>
  );
}
