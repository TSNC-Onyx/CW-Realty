import { respondToConsentRequest } from "@/lib/tracking/consent-endpoint";

// The server's copy of the visitor's cookie choice and ad click IDs (docs/cwr-ads-analytics-fixes-plan.md, R7, R8).

export function POST(request: Request) {
  return respondToConsentRequest(request);
}
