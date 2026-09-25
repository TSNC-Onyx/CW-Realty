import "server-only";

import type { AdminContext } from "@/lib/admin/require-admin";

// Editors' view of the team: includes hidden members; excludes the trash.

const MAX_TEAM_ROWS = 200;

export type AdminTeamMember = {
  id: string;
  slug: string;
  full_name: string;
  job_title: string;
  bio: string;
  email: string | null;
  phone: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  photo_width: number | null;
  photo_height: number | null;
  is_visible: boolean;
};

const TEAM_COLUMNS = "id, slug, full_name, job_title, bio, email, phone, photo_path, photo_alt, photo_width, photo_height, is_visible";

export async function fetchAdminTeam({ supabase, tenantId }: AdminContext): Promise<AdminTeamMember[]> {
  const { data } = await supabase
    .from("team_members")
    .select(TEAM_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("full_name")
    .limit(MAX_TEAM_ROWS)
    .returns<AdminTeamMember[]>();
  return data ?? [];
}

export async function fetchAdminTeamMember({ supabase, tenantId }: AdminContext, id: string): Promise<AdminTeamMember | null> {
  const { data } = await supabase.from("team_members").select(TEAM_COLUMNS).eq("tenant_id", tenantId).eq("id", id).is("deleted_at", null).maybeSingle<AdminTeamMember>();
  return data;
}
