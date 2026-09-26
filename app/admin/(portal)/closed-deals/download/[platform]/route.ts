import { unstable_rethrow } from "next/navigation";

import { fetchClosedDeals } from "@/lib/admin/closed-deals/queries";
import { AdminAccessError, EDITOR_ROLES, requireAdmin } from "@/lib/admin/require-admin";
import { getGoogleAdsCsv, getMetaCsv, type ExportDeal } from "@/lib/tracking/offline-export";

// Closed-deal files for Google Ads and Meta (plan decision 11); owners and managers only.

const EXPORTS: Record<string, { fileName: string; getCsv: (deals: ExportDeal[]) => Promise<string> }> = {
  "google-ads": { fileName: "cwr-closed-deals-google-ads.csv", getCsv: getGoogleAdsCsv },
  meta: { fileName: "cwr-closed-deals-meta.csv", getCsv: getMetaCsv },
};

export async function GET(_request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const csvExport = EXPORTS[platform];
  if (!csvExport) return new Response("Not found", { status: 404 });
  try {
    const deals = await fetchClosedDeals(await requireAdmin(EDITOR_ROLES));
    return new Response(await csvExport.getCsv(deals), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvExport.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AdminAccessError) return new Response("Your role cannot download closed deals.", { status: 403 });
    console.error(JSON.stringify({ message: "Closed deal export failed", platform, error: error instanceof Error ? error.name : "unknown" }));
    return new Response("The download didn't work. Try again in a moment.", { status: 500 });
  }
}
