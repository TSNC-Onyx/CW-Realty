import type { Metadata } from "next";

import { DownloadDetailsForm } from "@/components/admin/homework/download-details-form";
import { TextLink } from "@/components/ui/text-link";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Add download or link" };

const EMPTY_DOWNLOAD = { delivery: "file" as const, groupKey: "buyers", title: "", description: "", linkUrl: "", isSpanish: false, isVisible: true };

export default async function NewHomeworkDownloadPage() {
  await requireAdminPage(EDITOR_ROLES);
  return (
    <>
      <TextLink href="/admin/homework">Back to Homework</TextLink>
      <h1 className="type-h1 mt-4 mb-2">Add download or link</h1>
      <p className="type-lead mb-10 text-muted">Save the details first. For a file, you upload it on the next screen.</p>
      <DownloadDetailsForm mode="create" idempotencyKey={crypto.randomUUID()} defaults={EMPTY_DOWNLOAD} />
    </>
  );
}
