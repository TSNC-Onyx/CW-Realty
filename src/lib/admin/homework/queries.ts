import "server-only";

import type { AdminContext } from "@/lib/admin/require-admin";
import type { HomeworkGroupKey, HomeworkKind } from "@/lib/content/homework-rules";

// Editors' view of Homework: includes hidden items; excludes the trash.

const MAX_HOMEWORK_ROWS = 200;

export type AdminHomeworkItem = {
  id: string;
  kind: HomeworkKind;
  group_key: HomeworkGroupKey | null;
  title: string;
  description: string;
  is_spanish: boolean;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  captions_path: string | null;
  link_url: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  photo_width: number | null;
  photo_height: number | null;
  is_visible: boolean;
};

const HOMEWORK_COLUMNS =
  "id, kind, group_key, title, description, is_spanish, file_path, file_name, file_mime, file_size_bytes, duration_seconds, captions_path, link_url, photo_path, photo_alt, photo_width, photo_height, is_visible";

export async function fetchAdminHomework({ supabase, tenantId }: AdminContext): Promise<AdminHomeworkItem[]> {
  const { data } = await supabase
    .from("homework_items")
    .select(HOMEWORK_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("title")
    .limit(MAX_HOMEWORK_ROWS)
    .returns<AdminHomeworkItem[]>();
  return data ?? [];
}

export async function fetchAdminHomeworkItem({ supabase, tenantId }: AdminContext, id: string): Promise<AdminHomeworkItem | null> {
  const { data } = await supabase
    .from("homework_items")
    .select(HOMEWORK_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<AdminHomeworkItem>();
  return data;
}
