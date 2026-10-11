import type { Metadata } from "next";
import { z } from "zod";

import { ConnectionEditor } from "@/components/admin/connections/connection-editor";
import { LoadProblem } from "@/components/admin/load-problem";
import { CreatedMessage } from "@/components/admin/uploads/created-message";
import { TextLink } from "@/components/ui/text-link";
import { getConnectionPhoto } from "@/lib/admin/connections/connection-photo";
import { getMissedCount } from "@/lib/admin/created-href";
import { fetchAdminConnection } from "@/lib/admin/connections/queries";
import { showPageNotFound } from "@/lib/admin/record-page-not-found";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { CONNECTIONS_PAGE_PATH } from "@/lib/site/navigation";
import { fetchPageListing } from "@/lib/site/page-listing";
import { getDisplayPhone, type E164Phone } from "@/lib/site/phone";

export const metadata: Metadata = { title: "Edit connection" };

type EditConnectionPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; missed?: string }> };

function ConnectionLoadProblem({ notice }: { notice: LoadProblemNotice | null }) {
  return (
    <>
      <TextLink href="/admin/connections">Back to connections</TextLink>
      <h1 className="type-h1 mt-4 mb-8">Edit connection</h1>
      <LoadProblem notice={notice} />
    </>
  );
}

export default async function EditConnectionPage({ params, searchParams }: EditConnectionPageProps) {
  const [{ id }, { created, missed }] = await Promise.all([params, searchParams]);
  const admin = await requireAdminPage(EDITOR_ROLES);
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return showPageNotFound({ admin, path: `/admin/connections/${id}` });
  const connectionLoad = await fetchAdminConnection(admin, parsedId.data);
  const notice = await reportPageLoad({ admin, action: "connections.load", results: [connectionLoad] });
  if (!connectionLoad.isLoaded) return <ConnectionLoadProblem notice={notice} />;
  const connection = connectionLoad.data;
  if (!connection) return showPageNotFound({ admin, path: `/admin/connections/${id}` });
  const { isConnectionsPageVisible } = await fetchPageListing();
  return (
    <>
      <TextLink href="/admin/connections">Back to connections</TextLink>
      <h1 className="type-h1 mt-4 mb-2">{connection.full_name}</h1>
      <div className="mb-10">
        {isConnectionsPageVisible ? (
          <TextLink href={CONNECTIONS_PAGE_PATH} hasArrow>View the Connections page</TextLink>
        ) : (
          <p className="text-muted">The Connections page is hidden from the website. Partners stay saved for when it shows again.</p>
        )}
      </div>
      {created && <CreatedMessage title="Connection added" nextStep="Change anything below, or go back to the list." missedCount={getMissedCount(missed)} fileNoun="photo" />}
      <ConnectionEditor
        connectionId={connection.id}
        photo={getConnectionPhoto(connection)}
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
