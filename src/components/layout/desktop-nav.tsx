"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, type FocusEvent, type KeyboardEvent } from "react";

import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { MENU_SECTIONS, isCurrentPath, isCurrentSection, type NavLink } from "@/lib/site/navigation";

// Style §11.9 desktop menu on the dark header. Items with sub-pages use the WAI-ARIA APG disclosure
// pattern: a button toggles a list; Escape, clicking a link, or leaving closes it.

const ITEM_CLASS = "relative flex h-11 items-center gap-1 px-3 text-base font-semibold";
const CURRENT_BAR_CLASS = "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-gold";

function getItemClassName(isCurrent: boolean): string {
  return isCurrent ? `${ITEM_CLASS} ${CURRENT_BAR_CLASS}` : ITEM_CLASS;
}

type DisclosureLinkProps = { link: NavLink; isCurrent: boolean; onNavigate: () => void };

function DisclosureLink({ link, isCurrent, onNavigate }: DisclosureLinkProps) {
  return (
    <li>
      <Link
        href={link.href}
        onClick={onNavigate}
        aria-current={isCurrent ? "page" : undefined}
        className={`flex min-h-11 items-center px-4 text-base ${isCurrent ? "font-bold" : "font-semibold"}`}
      >
        {link.label}
      </Link>
    </li>
  );
}

type NavDisclosureProps = { label: string; links: NavLink[]; pathname: string; isCurrent: boolean };

function NavDisclosure({ label, links, pathname, isCurrent }: NavDisclosureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const listId = useId();

  const handleToggle = () => setIsOpen((wasOpen) => !wasOpen);
  const handleClose = () => setIsOpen(false);
  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key === "Escape") handleClose();
  };
  const handleBlur = (event: FocusEvent<HTMLLIElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) handleClose();
  };

  return (
    <li className="relative" onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={listId}
        onClick={handleToggle}
        className={getItemClassName(isCurrent)}
      >
        {label}
        {isCurrent && <span className="sr-only">(current section)</span>}
        <ChevronDown aria-hidden size={ICON_SIZE.chevron} />
      </button>
      <ul id={listId} hidden={!isOpen} className="absolute top-full left-0 z-50 min-w-56 border border-divider-dark border-t-2 border-t-gold bg-dark py-2">
        {links.map((link) => (
          <DisclosureLink key={link.href} link={link} isCurrent={isCurrentPath(pathname, link.href)} onNavigate={handleClose} />
        ))}
      </ul>
    </li>
  );
}

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {MENU_SECTIONS.map((section) => {
          const isCurrent = isCurrentSection(pathname, section);
          if (section.kind === "group") {
            return (
              <NavDisclosure key={section.label} label={section.label} links={section.links} pathname={pathname} isCurrent={isCurrent} />
            );
          }
          return (
            <li key={section.label}>
              <Link href={section.href} aria-current={isCurrent ? "page" : undefined} className={getItemClassName(isCurrent)}>
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
