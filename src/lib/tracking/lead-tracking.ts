import "server-only";

import { cookies, headers } from "next/headers";
import { after } from "next/server";

import type { InboxSource } from "@/lib/forms/intake";
import type { Visitor } from "@/lib/security/visitor";
import { ATTRIBUTION_FIELD_NAME, getAttributionFromField, getLeadAttributionRow, type LeadAttributionRow } from "@/lib/tracking/attribution";
import type { GoogleUserData } from "@/lib/tracking/data-layer";
import { getGoogleHashedContact, getMetaHashedContact } from "@/lib/tracking/hashing";
import { getMetaServerEvent, sendMetaServerEvent, type MetaEventName } from "@/lib/tracking/meta-conversions";
import { fetchVisitorConsent } from "@/lib/tracking/server-consent";
import { fetchTrackingSettings } from "@/lib/tracking/tracking-settings";

// What a sent lead tells the ad platforms (plan decisions 9, 10, 12), and only when the
// visitor allowed Advertising and their browser did not send Global Privacy Control.

const FBC_COOKIE = "_fbc";
const FBP_COOKIE = "_fbp";
const FBC_PATTERN = /^fb\.[0-9]\.[0-9]{10,13}\.[A-Za-z0-9_-]{10,255}$/;
const FBP_PATTERN = /^fb\.[0-9]\.[0-9]{10,13}\.[0-9]{5,20}$/;
const META_EVENT_NAMES: Record<InboxSource, MetaEventName> = { contact: "Lead", chat_handoff: "Lead", booking: "Schedule" };

export type LeadTracking = {
  isAdsAllowed: boolean;
  attributionRow: LeadAttributionRow | null;
  fbc: string | null;
  fbp: string | null;
  sourceUrl: string | null;
  userAgent: string | null;
};

/** Sent back to the browser so it can report the key event with the same ID as the server. */
export type FormConversion = { eventId: string; userData: GoogleUserData | null };

export type LeadContact = { email: string | null; phone: string | null };

const NO_AD_TRACKING: Omit<LeadTracking, "isAdsAllowed"> = { attributionRow: null, fbc: null, fbp: null, sourceUrl: null, userAgent: null };

function getCheckedCookie(value: string | undefined, pattern: RegExp): string | null {
  return value && pattern.test(value) ? value : null;
}

// The page the form was on, without its query string (Meta restricts URL details for housing).
function getSourceUrl(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export async function fetchLeadTracking(formData: FormData): Promise<LeadTracking> {
  const { allowed } = await fetchVisitorConsent();
  if (!allowed.ads) return { isAdsAllowed: false, ...NO_AD_TRACKING };
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const fbc = getCheckedCookie(cookieStore.get(FBC_COOKIE)?.value, FBC_PATTERN);
  const fbp = getCheckedCookie(cookieStore.get(FBP_COOKIE)?.value, FBP_PATTERN);
  const attribution = getAttributionFromField(formData.get(ATTRIBUTION_FIELD_NAME));
  return {
    isAdsAllowed: true,
    attributionRow: getLeadAttributionRow({ attribution, fbc, fbp }),
    fbc,
    fbp,
    sourceUrl: getSourceUrl(headerStore.get("referer")),
    userAgent: headerStore.get("user-agent"),
  };
}

export async function getFormConversion({ eventId, contact, tracking }: { eventId: string; contact: LeadContact; tracking: LeadTracking }): Promise<FormConversion> {
  if (!tracking.isAdsAllowed) return { eventId, userData: null };
  const { emailHash, phoneHash } = await getGoogleHashedContact(contact);
  const userData: GoogleUserData = {
    ...(emailHash ? { sha256_email_address: emailHash } : {}),
    ...(phoneHash ? { sha256_phone_number: phoneHash } : {}),
  };
  return { eventId, userData };
}

type MetaLead = { source: InboxSource; eventId: string; contact: LeadContact; tracking: LeadTracking; visitor: Visitor; occurredAt: Date };

async function sendMetaLead({ source, eventId, contact, tracking, visitor, occurredAt }: MetaLead): Promise<void> {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const { metaPixelId } = await fetchTrackingSettings();
  if (!accessToken || !metaPixelId || !tracking.sourceUrl || !tracking.userAgent) return;
  const { emailHash, phoneHash } = await getMetaHashedContact(contact);
  const event = getMetaServerEvent({
    eventName: META_EVENT_NAMES[source],
    eventId,
    occurredAt,
    sourceUrl: tracking.sourceUrl,
    emailHash,
    phoneHash,
    fbc: tracking.fbc,
    fbp: tracking.fbp,
    clientIp: visitor.ip,
    userAgent: tracking.userAgent,
  });
  await sendMetaServerEvent({ pixelId: metaPixelId, accessToken, event });
}

/** Sends the lead to Meta after the visitor has their reply; a failure is logged, never shown. */
export function scheduleMetaLead(lead: Omit<MetaLead, "occurredAt">): void {
  if (!lead.tracking.isAdsAllowed) return;
  const occurredAt = new Date();
  after(async () => {
    try {
      await sendMetaLead({ ...lead, occurredAt });
    } catch (error) {
      console.error(JSON.stringify({ message: "Meta lead event not sent", source: lead.source, error: error instanceof Error ? error.name : "unknown" }));
    }
  });
}
