import { getCallHref, getDisplayPhone, getTextHref } from "@/lib/site/phone";
import type { SiteSettings } from "@/lib/site/site-settings";

// Ready-to-render contact links; serializable so client components (menus, forms) can use them.

export const CONTACT_PAGE_PATH = "/contact";

export type ContactLinks = {
  displayPhone: string;
  callHref: string;
  textHref: string;
  email: string;
  emailHref: string;
};

/** Null when site settings are unavailable; callers then point visitors to the Contact page. */
export function getContactLinks(settings: SiteSettings | null): ContactLinks | null {
  if (!settings) return null;
  return {
    displayPhone: getDisplayPhone(settings.callPhone),
    callHref: getCallHref(settings.callPhone),
    textHref: getTextHref(settings.textPhone),
    email: settings.email,
    emailHref: `mailto:${settings.email}`,
  };
}
