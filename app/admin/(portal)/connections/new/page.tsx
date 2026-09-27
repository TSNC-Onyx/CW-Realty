import type { Metadata } from "next";

import { ConnectionForm } from "@/components/admin/connections/connection-form";
import { TextLink } from "@/components/ui/text-link";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { CONNECTION_CATEGORIES } from "@/lib/content/connection-categories";

export const metadata: Metadata = { title: "Add connection" };

const EMPTY_CONNECTION = { fullName: "", category: CONNECTION_CATEGORIES[0], titleLine: "", phone: "", email: "", website: "", isVisible: true };

export default async function NewConnectionPage() {
  await requireAdminPage(EDITOR_ROLES);
  return (
    <>
      <TextLink href="/admin/connections">Back to connections</TextLink>
      <h1 className="type-h1 mt-4 mb-2">Add connection</h1>
      <p className="type-lead mb-10 text-muted">You can add a photo after saving.</p>
      <ConnectionForm mode="create" idempotencyKey={crypto.randomUUID()} defaults={EMPTY_CONNECTION} />
    </>
  );
}
