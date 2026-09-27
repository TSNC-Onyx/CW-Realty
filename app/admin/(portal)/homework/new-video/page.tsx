import type { Metadata } from "next";

import { VideoDetailsForm } from "@/components/admin/homework/video-details-form";
import { TextLink } from "@/components/ui/text-link";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Add video" };

const EMPTY_VIDEO = { title: "", description: "", isSpanish: false, isVisible: false };

export default async function NewHomeworkVideoPage() {
  await requireAdminPage(EDITOR_ROLES);
  return (
    <>
      <TextLink href="/admin/homework">Back to Homework</TextLink>
      <h1 className="type-h1 mt-4 mb-2">Add video</h1>
      <p className="type-lead mb-10 text-muted">Save the details first, then upload the video. It shows on the Homework page once uploaded.</p>
      <VideoDetailsForm mode="create" idempotencyKey={crypto.randomUUID()} defaults={EMPTY_VIDEO} />
    </>
  );
}
