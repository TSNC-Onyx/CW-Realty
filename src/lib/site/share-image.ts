import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site/navigation";

// The picture shown when someone texts or posts a link to the site (owner choice
// 2026-09-27, Option B: the Home hero photo with the CWR logo large in its gold ring).
// Its address uses the host the page was requested on, so links to the test address
// show it too; the main address stays www.charliewardrealty.com (the Wix site until go-live).

const SHARE_IMAGE = {
  path: "/brand/cwr-share.jpg",
  width: 1200,
  height: 630,
  alt: "Charlie Ward Realty logo over a white contemporary farmhouse",
};

const SITE_HOST = new URL(SITE_URL).hostname;
const APEX_HOST = SITE_HOST.replace(/^www\./, "");
const WORKER_HOST = "cw-realty.onyxventuresnc.workers.dev";
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1"];

function isKnownHostname(hostname: string): boolean {
  if (hostname === SITE_HOST || hostname === APEX_HOST || hostname === WORKER_HOST) return true;
  // Pull request previews are served at <alias>-cw-realty.onyxventuresnc.workers.dev.
  return hostname.endsWith(`-${WORKER_HOST}`);
}

/** The origin to use for the share image; unknown hosts fall back to the main address. */
export function getShareOrigin(host: string | null): string {
  if (!host) return SITE_URL;
  const hostname = (host.split(":").at(0) ?? "").toLowerCase();
  if (LOCAL_HOSTNAMES.includes(hostname)) return `http://${host}`;
  if (isKnownHostname(hostname)) return `https://${hostname}`;
  return SITE_URL;
}

export function getShareMetadata(host: string | null): Pick<Metadata, "openGraph" | "twitter"> {
  const { path, width, height, alt } = SHARE_IMAGE;
  const image = { url: `${getShareOrigin(host)}${path}`, width, height, alt };
  return {
    openGraph: { type: "website", siteName: "Charlie Ward Realty", images: [image] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}
