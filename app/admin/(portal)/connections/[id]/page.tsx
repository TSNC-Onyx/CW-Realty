import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ConnectionForm } from "@/components/admin/connections/connection-form";
import { ConnectionPhoto } from "@/components/admin/connections/connection-photo";
import { Message } from "@/components/ui/message";
import { TextLink } from "@/components/ui/text-link";
import { getConnectionPhoto } from "@/lib/admin/connections/connection-photo";
import { fetchAdminConnection } from "@/lib/admin/connections/queries";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { getDisplayPhone, type E164Phone } from "@/lib/site/phone";

export const metadata: Metadata = { title: "Edit connection" };

type EditConnectionPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> };

export default async function EditConnectionPage({ params, searchParams }: EditConnectionPageProps) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const admin = await requireAdminPage(EDITOR_ROLES);
  const parsedId = z.uuid().safeParse(id);
  const connection = parsedId.success ? await fetchAdminConnection(admin, parsedId.data) : null;
  if (!connection) notFound();
  return (
    <>
      <TextLink href="/admin/connections">Back to connections</TextLink>
      <h1 className="type-h1 mt-4 mb-2">{connection.full_name}</h1>
      <div className="mb-10">
        <TextLink href="/connections" hasArrow>View the Connections page</TextLink>
      </div>
      {created && (
        <div className="mb-8 max-w-prose">
          <Message tone="success" title="Connection added">
            <p>Add a photo below, or keep editing.</p>
          </Message>
        </div>
      )}
      <section aria-labelledby="photo-heading" className="mb-12 border-t-2 border-ink pt-6">
        <h2 id="photo-heading" className="type-h3 mb-4">Photo</h2>
        <ConnectionPhoto connectionId={connection.id} fullName={connection.full_name} photo={getConnectionPhoto(connection)} />
      </section>
      <ConnectionForm
        mode="edit"
        connectionId={connection.id}
        defaults={{
          fullName: connection.full_name,
          category: connection.category,
          titleLine: connection.title_line,
          phone: connection.phone ? getDisplayPhone(connection.phone as E164Phone) : "",
          email: connection.email ?? "",
          website: connection.website ?? "",
          isVisible: connection.is_visible,
        }}
      />
    </>
  );
}
