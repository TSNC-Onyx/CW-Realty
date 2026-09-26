"use client";

import { useSyncExternalStore } from "react";

import { getStoredAttribution, subscribeToAttribution } from "@/lib/tracking/attribution-store";
import { ATTRIBUTION_FIELD_NAME } from "@/lib/tracking/attribution";

// Sends the landing link's ad click IDs with a form. It is empty unless the visitor allowed
// Advertising, and the server checks consent again before saving anything (plan decision 12).

function getServerSnapshot(): string {
  return "";
}

export function AttributionField() {
  const value = useSyncExternalStore(subscribeToAttribution, getStoredAttribution, getServerSnapshot);
  return <input type="hidden" name={ATTRIBUTION_FIELD_NAME} value={value} />;
}
