import type { Metadata } from "next";

import { NewVideoForm } from "@/components/admin/homework/new-video-form";
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
      <p className="type-lead mb-10 text-muted">Add the video and its title. It shows on the Homework page once uploaded.</p>
      <NewVideoForm idempotencyKey={crypto.randomUUID()} defaults={EMPTY_VIDEO} />
    </>
  );
}
