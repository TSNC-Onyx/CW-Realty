import { Trash2 } from "lucide-react";
import type { Metadata } from "next";

import { LoadProblem } from "@/components/admin/load-problem";
import { TrashList, type TrashListItem } from "@/components/admin/trash/trash-list";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { reportPageLoad } from "@/lib/admin/report-page-load";
import { EDITOR_ROLES, OWNER_ROLES, hasRole, requireAdminPage } from "@/lib/admin/require-admin";
import { fetchTrash, type TrashItem } from "@/lib/admin/trash/queries";

export const metadata: Metadata = { title: "Trash" };

const TYPE_LABELS: Record<TrashItem["item_type"], string> = { listings: "Listing", listing_photos: "Listing photo", team_members: "Team member", closed_deals: "Closed deal", connections: "Connection", homework_items: "Homework item" };
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

function getListItem(item: TrashItem): TrashListItem {
  return {
    id: item.id,
    table: item.item_type,
    typeLabel: TYPE_LABELS[item.item_type],
    label: item.label,
    deletedOn: DATE_FORMAT.format(new Date(item.deleted_at)),
    purgeOn: DATE_FORMAT.format(new Date(item.purge_after)),
  };
}

function TrashContent({ items, canDeleteForever }: { items: TrashItem[]; canDeleteForever: boolean }) {
  if (items.length > 0) return <TrashList canDeleteForever={canDeleteForever} items={items.map(getListItem)} />;
  return (
    <EmptyState
      icon={Trash2}
      titleId="trash-empty"
      title="The trash is empty"
      description="Listings, photos, team members, and closed deals you delete show up here for 30 days."
      action={<ButtonLink href="/admin" size="m" variant="main">Back to dashboard</ButtonLink>}
    />
  );
}

export default async function TrashPage() {
  const admin = await requireAdminPage(EDITOR_ROLES);
  const trash = await fetchTrash(admin);
  const notice = await reportPageLoad({ admin, action: "trash.load", results: [trash] });
  return (
    <>
      <h1 className="type-h1 mb-2">Trash</h1>
      <p className="type-lead mb-8 max-w-prose text-muted">Deleted items stay here for 30 days, then they are removed for good.</p>
      {trash.isLoaded ? <TrashContent items={trash.data} canDeleteForever={hasRole(admin, OWNER_ROLES)} /> : <LoadProblem notice={notice} />}
    </>
  );
}
