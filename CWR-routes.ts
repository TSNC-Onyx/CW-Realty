// Single source of truth for the CWR rebuild. sitemap.ts and redirects are derived from this.
export type Route = { path: string; legacy?: string[]; title: string; section: string };

export const SITE_URL = "https://www.charliewardrealty.com";

export const routes: Route[] = [
  { path: "/",                 legacy: [],                    title: "Home",            section: "root" },
  { path: "/about",            legacy: ["/about-us"],         title: "About Us",        section: "company" },
  { path: "/contact",          legacy: [],                    title: "Contact",         section: "company" },
  { path: "/privacy-policy",   legacy: [],                    title: "Privacy Policy",  section: "company" },

  { path: "/team",                  legacy: ["/support-team"],            title: "CWR Team",        section: "team" },
  { path: "/team/charlie-ward",     legacy: ["/charlie-ward"],            title: "Charlie Ward",    section: "team" },
  { path: "/team/ashley-edwards",   legacy: ["/copy-of-russell-casey"],   title: "Ashley Edwards",  section: "team" },
  { path: "/team/jerome-pappas",    legacy: ["/jerome-pappas-broker"],    title: "Jerome Pappas",   section: "team" },
  { path: "/team/ryan-dixon",       legacy: ["/ryan-dixon-cwr"],          title: "Ryan Dixon",      section: "team" },
  { path: "/team/cherri-dixon",     legacy: ["/cherri-dixon-cwr"],        title: "Cherri Dixon",    section: "team" },
  { path: "/team/herita-jones",     legacy: ["/herita-jones"],            title: "Herita Jones",    section: "team" },
  { path: "/team/princess-garner",  legacy: ["/copy-of-princess-garner"], title: "Princess Garner", section: "team" },
  { path: "/team/richard-chitman",  legacy: ["/richard-chitman"],         title: "Richard Chitman", section: "team" },
  { path: "/team/jayne-trinette",   legacy: ["/jayne-trinette-cwr"],      title: "Jayne Trinette",  section: "team" },
  { path: "/team/russell-casey",    legacy: ["/russell-casey"],           title: "Russell Casey",   section: "team" }, // was orphan

  { path: "/listings",                                         legacy: [],                                          title: "Featured Properties", section: "listings" }, // new index; Wix had a menu folder only
  { path: "/listings/5423-pine-level-dr-browns-summit-nc",     legacy: ["/5423pineleveldr"],                        title: "5423 Pine Level Dr, Browns Summit, NC", section: "listings" },
  { path: "/listings/1514-woodridge-ave-greensboro-nc",        legacy: ["/1514woodridgeave"],                       title: "1514 Woodridge Ave, Greensboro, NC",    section: "listings" },
  { path: "/listings/912-rocky-meadows-ln",                    legacy: ["/rocky-meadows-lane"],                     title: "912 Rocky Meadows Ln",                  section: "listings" }, // was orphan; city not stated on page
  { path: "/listings/3826-burlington-rd-greensboro-nc-27405",  legacy: ["/3826-burlington-rd-greensboro-nc-27405"], title: "3826 Burlington Rd, Greensboro, NC",    section: "listings" }, // was orphan

  { path: "/property-search",       legacy: [],             title: "Property Search", section: "services" },
  { path: "/services/cwr-touchup",  legacy: ["/cwrtouchup"], title: "CWR TouchUp",    section: "services" },
  { path: "/connections",           legacy: ["/sell"],       title: "Connections",    section: "resources" },
  { path: "/resources",             legacy: ["/faq"],        title: "Homework",       section: "resources" },
];
