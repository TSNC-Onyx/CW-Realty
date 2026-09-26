"use client";

import { ClipboardCheck } from "lucide-react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { markTagsReviewedAction } from "@/lib/admin/tracking/actions";

// Features §4 quarterly tag review: one click records today's review.
export function TagReviewButton() {
  return <QuickActionButton label="Mark tags reviewed" accessibleLabel="Mark tags reviewed today" icon={ClipboardCheck} onRun={markTagsReviewedAction} />;
}
