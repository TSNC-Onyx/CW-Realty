// Menu, footer, and page list from docs/reference/site/navigation-reconciliation.md.
// Header, mobile menu, footer, 404 page, and redirect middleware all read from here.

export const SITE_URL = "https://www.charliewardrealty.com";
export const NC_AGENCY_DISCLOSURE_URL = "https://www.ncrec.gov/Brochures/Print/WWREAPrint.pdf";

// The mobile Menu control links to the footer menu, so phones without JavaScript still reach every page.
export const SITE_FOOTER_ID = "site-footer";

export type NavLink = { label: string; href: string };

export type NavSection =
  | { kind: "link"; label: string; href: string }
  | { kind: "group"; label: string; links: NavLink[] };

export const MENU_SECTIONS: NavSection[] = [
  {
    kind: "group",
    label: "Listings",
    links: [
      { label: "Featured properties", href: "/listings" },
      { label: "Property search", href: "/property-search" },
    ],
  },
  {
    kind: "group",
    label: "Services",
    links: [{ label: "CWR TouchUp", href: "/services/cwr-touchup" }],
  },
  { kind: "link", label: "Team", href: "/team" },
  {
    kind: "group",
    label: "Resources",
    links: [
      { label: "FAQs & Homework", href: "/resources" },
      { label: "Connections", href: "/connections" },
    ],
  },
  {
    kind: "group",
    label: "About",
    links: [
      { label: "About us", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

// Pages served by this app without a database lookup. Anything else may be an
// old URL, so the middleware checks cwr.redirects for it.
export const STATIC_PAGE_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/about",
  "/contact",
  "/privacy-policy",
  "/resources",
  "/connections",
  "/services/cwr-touchup",
  "/property-search",
]);

export function getFooterColumns(): { heading: string; links: NavLink[] }[] {
  return MENU_SECTIONS.map((section) =>
    section.kind === "link"
      ? { heading: section.label, links: [{ label: "CWR team", href: section.href }] }
      : { heading: section.label, links: section.links },
  );
}

export function getAllMenuLinks(): NavLink[] {
  return getFooterColumns().flatMap((column) => column.links);
}

export function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isCurrentSection(pathname: string, section: NavSection): boolean {
  if (section.kind === "link") return isCurrentPath(pathname, section.href);
  return section.links.some((link) => isCurrentPath(pathname, link.href));
}
