import { headers } from "next/headers";

import { ConsentManager } from "@/components/tracking/consent-manager";
import { NONCE_HEADER } from "@/lib/security/content-security-policy";
import { DEFAULT_TAG_SCRIPT_ORIGIN } from "@/lib/tracking/data-layer";
import { fetchVisitorConsent } from "@/lib/tracking/server-consent";
import { getTagServerOrigin } from "@/lib/tracking/tag-server";
import { fetchTrackingSettings } from "@/lib/tracking/tracking-settings";

// Public-site tracking (Phase 6). Without a Tag Manager container nothing renders at all: no
// banner, no scripts (plan decision 5). The visitor's saved choice is read on the server so
// the banner never flashes for someone who already chose.

export async function Tracking() {
  const { gtmContainerId } = await fetchTrackingSettings();
  if (!gtmContainerId) return null;
  const [consent, headerStore] = await Promise.all([fetchVisitorConsent(), headers()]);
  return (
    <ConsentManager
      containerId={gtmContainerId}
      scriptOrigin={getTagServerOrigin(process.env.TAG_SERVER_URL) ?? DEFAULT_TAG_SCRIPT_ORIGIN}
      nonce={headerStore.get(NONCE_HEADER) ?? ""}
      initialChoice={consent.choice}
      isGpcOnServer={consent.isGpcOn}
    />
  );
}
