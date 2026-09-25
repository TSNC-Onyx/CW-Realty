"use client";

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { getButtonClassName } from "@/components/ui/button-link";
import { moveListingAction } from "@/lib/admin/listings/actions";
import { STATUS_LABELS, type PublishState } from "@/lib/admin/listings/workflow";
import { moveToTrashAction, restoreFromTrashAction } from "@/lib/admin/trash/actions";
import type { ListingStatus } from "@/lib/content/listings";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

export type ListingListItem = {
  id: string;
  streetAddress: string;
  cityLine: string;
  price: string;
  status: ListingStatus;
  publishState: PublishState;
  photoCount: number;
};

function ListingRow({ listing, isFirst, isLast }: { listing: ListingListItem; isFirst: boolean; isLast: boolean }) {
  const trashTarget = { table: "listings" as const, id: listing.id };
  const summary = [listing.price, STATUS_LABELS[listing.status], listing.publishState === "live" ? "On the website" : "Draft", `${listing.photoCount} photos`];
  return (
    <li className="grid gap-3 border-t border-line py-4 md:grid-cols-12 md:items-center">
      <div className="md:col-span-5">
        <p className="font-bold">{listing.streetAddress}</p>
        <p className="type-small text-muted">{listing.cityLine}</p>
        <p className="type-small text-muted">{summary.join(" · ")}</p>
      </div>
      <div className="flex flex-wrap gap-2 md:col-span-7 md:justify-end">
        <Link href={`/admin/listings/${listing.id}`} className={`${getButtonClassName({ size: "s", variant: "main" })} px-3`}>
          <Pencil aria-hidden size={ICON_SIZE.button} />
          Edit
          <span className="sr-only">{listing.streetAddress}</span>
        </Link>
        <QuickActionButton label="Up" accessibleLabel={`Move ${listing.streetAddress} up`} icon={ArrowUp} isDisabled={isFirst} onRun={() => moveListingAction(listing.id, "up")} />
        <QuickActionButton label="Down" accessibleLabel={`Move ${listing.streetAddress} down`} icon={ArrowDown} isDisabled={isLast} onRun={() => moveListingAction(listing.id, "down")} />
        <QuickActionButton
          label="Trash"
          accessibleLabel={`Move ${listing.streetAddress} to trash`}
          icon={Trash2}
          onRun={() => moveToTrashAction(trashTarget)}
          undo={{ label: "Undo", onRun: () => restoreFromTrashAction(trashTarget) }}
        />
      </div>
    </li>
  );
}

export function ListingList({ listings }: { listings: ListingListItem[] }) {
  return (
    <ul className="border-b border-line">
      {listings.map((listing, index) => (
        <ListingRow key={listing.id} listing={listing} isFirst={index === 0} isLast={index === listings.length - 1} />
      ))}
    </ul>
  );
}
