import { BookUser, Plus } from "lucide-react";
import type { Metadata } from "next";

import { ConnectionList } from "@/components/admin/connections/connection-list";
import { LoadProblem } from "@/components/admin/load-problem";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { TextLink } from "@/components/ui/text-link";
import { getConnectionPhoto } from "@/lib/admin/connections/connection-photo";
import { fetchAdminConnections, type AdminConnection } from "@/lib/admin/connections/queries";
import type { LoadResult } from "@/lib/admin/load-result";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { EDITOR_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

export const metadata: Metadata = { title: "Connections" };

function ConnectionsBody({ connectionsLoad, notice }: { connectionsLoad: LoadResult<AdminConnection[]>; notice: LoadProblemNotice | null }) {
  if (!connectionsLoad.isLoaded) return <LoadProblem notice={notice} />;
  const connections = connectionsLoad.data;
  if (connections.length === 0) {
    return (
      <EmptyState
        icon={BookUser}
        titleId="connections-empty"
        title="No connections yet"
        description="Add the professionals you refer clients to, like loan officers and insurance agents."
        action={<ButtonLink href="/admin/connections/new" size="m" variant="main">Add connection</ButtonLink>}
      />
    );
  }
  return (
    <ConnectionList
      connections={connections.map((connection) => ({
        id: connection.id,
        fullName: connection.full_name,
        category: connection.category,
        titleLine: connection.title_line,
        isVisible: connection.is_visible,
        photo: getConnectionPhoto(connection),
      }))}
    />
  );
}

export default async function AdminConnectionsPage() {
  const admin = await requireAdminPage(EDITOR_ROLES);
  const connectionsLoad = await fetchAdminConnections(admin);
  const notice = await reportPageLoad({ admin, action: "connections.load", results: [connectionsLoad] });
  return (
    <>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="type-h1 mb-2">Connections</h1>
          <p className="type-lead text-muted">The order here is the order on the Connections page.</p>
          <TextLink href="/connections" hasArrow>View the Connections page</TextLink>
        </div>
        <ButtonLink href="/admin/connections/new" size="m" variant="main">
          <Plus aria-hidden size={ICON_SIZE.button} />
          Add connection
        </ButtonLink>
      </div>
      <ConnectionsBody connectionsLoad={connectionsLoad} notice={notice} />
    </>
  );
}
