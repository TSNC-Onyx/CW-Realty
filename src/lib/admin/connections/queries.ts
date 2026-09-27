import "server-only";

import type { AdminContext } from "@/lib/admin/require-admin";

// Editors' view of Connections: includes hidden partners; excludes the trash.

const MAX_CONNECTION_ROWS = 200;

export type AdminConnection = {
  id: string;
  full_name: string;
  category: string;
  title_line: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  photo_width: number | null;
  photo_height: number | null;
  is_visible: boolean;
};

const CONNECTION_COLUMNS = "id, full_name, category, title_line, phone, email, website, photo_path, photo_alt, photo_width, photo_height, is_visible";

export async function fetchAdminConnections({ supabase, tenantId }: AdminContext): Promise<AdminConnection[]> {
  const { data } = await supabase
    .from("connections")
    .select(CONNECTION_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("full_name")
    .limit(MAX_CONNECTION_ROWS)
    .returns<AdminConnection[]>();
  return data ?? [];
}

export async function fetchAdminConnection({ supabase, tenantId }: AdminContext, id: string): Promise<AdminConnection | null> {
  const { data } = await supabase
    .from("connections")
    .select(CONNECTION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<AdminConnection>();
  return data;
}
