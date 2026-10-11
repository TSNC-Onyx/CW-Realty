// Menu, footer, and page list from docs/reference/site/navigation-reconciliation.md.
// Header, mobile menu, footer, 404 page, and redirect middleware all read from here.
// An owner can hide the Connections page (docs/cwr-connections-page-switch-plan.md); the
// helpers below leave it out while hidden.

export const SITE_URL = "https://www.charliewardrealty.com";
export const NC_AGENCY_DISCLOSURE_URL = "https://www.ncrec.gov/Brochures/Print/WWREAPrint.pdf";

// The mobile Menu control links to the footer menu, so phones without JavaScript still reach every page.
export const SITE_FOOTER_ID = "site-footer";

// The home link leads the header menu (owner choice 2026-09-26); the footer reaches home through its logo.
const HOME_PATH = "/";
export const CONNECTIONS_PAGE_PATH = "/connections";

export type NavLink = { label: string; href: string };

export type NavSection =
  | { kind: "link"; label: string; href: string }
  | { kind: "group"; label: string; links: NavLink[] };

/** Owner switches that change which pages are listed; leaving them out lists every page. */
export type PageListing = { isConnectionsPageVisible: boolean };

const ALL_PAGES_LISTED: PageListing = { isConnectionsPageVisible: true };

export const MENU_SECTIONS: NavSection[] = [
  { kind: "link", label: "Home", href: HOME_PATH },
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
    links: [
      { label: "Selected services", href: "/services/selected-services" },
      { label: "CWR TouchUp", href: "/services/cwr-touchup" },
      { label: "Property management", href: "/services/property-management" },
    ],
  },
  { kind: "link", label: "Team", href: "/team" },
  {
    kind: "group",
    label: "Resources",
    links: [
      { label: "FAQs & Homework", href: "/resources" },
      { label: "Connections", href: CONNECTIONS_PAGE_PATH },
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
  CONNECTIONS_PAGE_PATH,
  "/services",
  "/services/selected-services",
  "/services/cwr-touchup",
  "/services/property-management",
  "/property-search",
  "/listings",
  "/team",
]);

// Pages served by this app but reachable only by their link: kept out of the menu,
// footer, sitemap, and search results until the owner is ready to list them.
// None at the moment: the seller consulting page became the listed Selected services page (2026-10-02).
export const UNLISTED_PAGE_PATHS: ReadonlySet<string> = new Set();

function isListed(href: string, listing: PageListing): boolean {
  return listing.isConnectionsPageVisible || href !== CONNECTIONS_PAGE_PATH;
}

function getListedSection(section: NavSection, listing: PageListing): NavSection {
  if (section.kind === "link") return section;
  return { ...section, links: section.links.filter((link) => isListed(link.href, listing)) };
}

export function getMenuSections(listing: PageListing = ALL_PAGES_LISTED): NavSection[] {
  return MENU_SECTIONS.map((section) => getListedSection(section, listing)).filter((section) => section.kind === "link" || section.links.length > 0);
}

/** Fixed pages for the sitemap, without any page an owner has hidden. */
export function getListedPagePaths(listing: PageListing = ALL_PAGES_LISTED): string[] {
  return [...STATIC_PAGE_PATHS].filter((path) => isListed(path, listing));
}

export function getFooterColumns(listing: PageListing = ALL_PAGES_LISTED): { heading: string; links: NavLink[] }[] {
  const footerSections = getMenuSections(listing).filter((section) => section.kind === "group" || section.href !== HOME_PATH);
  return footerSections.map((section) =>
    section.kind === "link"
      ? { heading: section.label, links: [{ label: "CWR team", href: section.href }] }
      : { heading: section.label, links: section.links },
  );
}

export function getAllMenuLinks(listing: PageListing = ALL_PAGES_LISTED): NavLink[] {
  return getFooterColumns(listing).flatMap((column) => column.links);
}

export function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isCurrentSection(pathname: string, section: NavSection): boolean {
  if (section.kind === "link") return isCurrentPath(pathname, section.href);
  return section.links.some((link) => isCurrentPath(pathname, link.href));
}
