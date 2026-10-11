import { BookUser, Plus } from "lucide-react";
import type { Metadata } from "next";

import { ConnectionList } from "@/components/admin/connections/connection-list";
import { ConnectionsPageSwitch } from "@/components/admin/connections/connections-page-switch";
import { LoadProblem } from "@/components/admin/load-problem";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { getConnectionPhoto } from "@/lib/admin/connections/connection-photo";
import { fetchConnectionsPageSwitch } from "@/lib/admin/connections/page-switch";
import { fetchAdminConnections, type AdminConnection } from "@/lib/admin/connections/queries";
import type { LoadResult } from "@/lib/admin/load-result";
import { reportPageLoad, type LoadProblemNotice } from "@/lib/admin/report-page-load";
import { EDITOR_ROLES, OWNER_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
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
  const [connectionsLoad, pageSwitchLoad] = await Promise.all([fetchAdminConnections(admin), fetchConnectionsPageSwitch(admin)]);
  const notice = await reportPageLoad({ admin, action: "connections.load", results: [connectionsLoad, pageSwitchLoad] });
  return (
    <>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="type-h1 mb-2">Connections</h1>
          <p className="type-lead text-muted">The order here is the order on the Connections page.</p>
        </div>
        <ButtonLink href="/admin/connections/new" size="m" variant="main">
          <Plus aria-hidden size={ICON_SIZE.button} />
          Add connection
        </ButtonLink>
      </div>
      {pageSwitchLoad.isLoaded ? (
        <ConnectionsPageSwitch {...pageSwitchLoad.data} canSwitch={OWNER_ROLES.includes(admin.role)} />
      ) : (
        <div className="mb-10 max-w-prose">
          <LoadProblem notice={notice} title="Whether the Connections page is showing didn't load" />
        </div>
      )}
      <ConnectionsBody connectionsLoad={connectionsLoad} notice={notice} />
    </>
  );
}
