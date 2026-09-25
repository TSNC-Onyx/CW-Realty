"use client";

import { CircleCheck, Eye, EyeOff, Globe } from "lucide-react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { ButtonLink } from "@/components/ui/button-link";
import { transitionListingAction } from "@/lib/admin/listings/actions";
import { STATUS_LABELS, canUndoStatusMove, getStatusMoves, type PublishState } from "@/lib/admin/listings/workflow";
import type { ListingStatus } from "@/lib/content/listings";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

type ListingPublishingProps = { listingId: string; status: ListingStatus; publishState: PublishState; photoCount: number };

function PublishButton({ listingId, publishState, photoCount }: Omit<ListingPublishingProps, "status">) {
  const isLive = publishState === "live";
  const toState = isLive ? "draft" : "live";
  return (
    <QuickActionButton
      label={isLive ? "Take off website" : "Publish to website"}
      accessibleLabel={isLive ? "Take this listing off the website" : "Publish this listing to the website"}
      icon={isLive ? EyeOff : Globe}
      isDisabled={!isLive && photoCount === 0}
      onRun={() => transitionListingAction({ listingId, workflow: "listing_publish", toState })}
      undo={{ label: "Undo", onRun: () => transitionListingAction({ listingId, workflow: "listing_publish", toState: publishState }) }}
    />
  );
}

// Status and publishing go through the workflow engine (Infra §4); preview before publish (Admin §1).
export function ListingPublishing({ listingId, status, publishState, photoCount }: ListingPublishingProps) {
  return (
    <div className="grid gap-4">
      <p>
        <span className="font-bold">On the website:</span> {publishState === "live" ? "Yes — visitors can see it." : "No — this is a draft."}
        <br />
        <span className="font-bold">Status:</span> {STATUS_LABELS[status]}
      </p>
      {publishState === "draft" && photoCount === 0 && <p className="type-small text-muted">Add at least one photo before publishing.</p>}
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/admin/listings/${listingId}/preview`} size="s" variant="secondary">
          <Eye aria-hidden size={ICON_SIZE.button} />
          Preview
        </ButtonLink>
        <PublishButton listingId={listingId} publishState={publishState} photoCount={photoCount} />
        {getStatusMoves(status).map((toStatus) => (
          <QuickActionButton
            key={toStatus}
            label={`Mark as ${STATUS_LABELS[toStatus].toLowerCase()}`}
            accessibleLabel={`Mark this listing as ${STATUS_LABELS[toStatus].toLowerCase()}`}
            icon={CircleCheck}
            onRun={() => transitionListingAction({ listingId, workflow: "listing_status", toState: toStatus })}
            undo={canUndoStatusMove(status, toStatus) ? { label: "Undo", onRun: () => transitionListingAction({ listingId, workflow: "listing_status", toState: status }) } : undefined}
          />
        ))}
      </div>
    </div>
  );
}
