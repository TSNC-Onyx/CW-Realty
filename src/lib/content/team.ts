import { cache } from "react";
import { z } from "zod";

import type { E164Phone } from "@/lib/site/phone";
import { CWR_TENANT_SLUG, SupabaseQueryError, getPublicClient } from "@/lib/supabase/public-client";

// Visible team members in the order the manager sets (Admin §3). Row Level Security
// hides hidden and deleted members from visitors.

const MAX_TEAM_MEMBERS = 100;

const TEAM_COLUMNS =
  "slug, full_name, job_title, bio, email, phone, photo_path, photo_alt, photo_width, photo_height, tenants!inner(slug)";

const teamRowSchema = z.object({
  slug: z.string(),
  full_name: z.string(),
  job_title: z.string(),
  bio: z.string(),
  email: z.string().nullable(),
  phone: z.string().regex(/^\+1[2-9][0-9]{9}$/).nullable(),
  photo_path: z.string().nullable(),
  photo_alt: z.string().nullable(),
  photo_width: z.number().int().nullable(),
  photo_height: z.number().int().nullable(),
});

type TeamRow = z.infer<typeof teamRowSchema>;

export type TeamPhoto = { folder: string; alt: string; width: number; height: number };

export type TeamMember = {
  slug: string;
  fullName: string;
  jobTitle: string;
  bio: string;
  email: string | null;
  phone: E164Phone | null;
  photo: TeamPhoto | null;
};

function getPhotoFromRow({ photo_path, photo_alt, photo_width, photo_height }: TeamRow): TeamPhoto | null {
  if (!photo_path || !photo_alt || !photo_width || !photo_height) return null;
  return { folder: photo_path, alt: photo_alt, width: photo_width, height: photo_height };
}

function getMemberFromRow(row: TeamRow): TeamMember {
  return {
    slug: row.slug,
    fullName: row.full_name,
    jobTitle: row.job_title,
    bio: row.bio,
    email: row.email,
    phone: row.phone as E164Phone | null,
    photo: getPhotoFromRow(row),
  };
}

function getTeamQuery() {
  const client = getPublicClient();
  if (!client) return null;
  return client
    .from("team_members")
    .select(TEAM_COLUMNS)
    .eq("tenants.slug", CWR_TENANT_SLUG);
}

/** Throws SupabaseQueryError when the database fails. */
export const fetchTeamMembers = cache(async (): Promise<TeamMember[]> => {
  const query = getTeamQuery();
  if (!query) return [];
  const { data: rows, error } = await query.order("sort_order").order("full_name").limit(MAX_TEAM_MEMBERS);
  if (error) throw new SupabaseQueryError(error.message, { operation: "fetchTeamMembers", cause: error });
  return z.array(teamRowSchema).parse(rows).map(getMemberFromRow);
});

export const fetchTeamMemberBySlug = cache(async (slug: string): Promise<TeamMember | null> => {
  const query = getTeamQuery();
  if (!query) return null;
  const { data: row, error } = await query.eq("slug", slug).maybeSingle();
  if (error) throw new SupabaseQueryError(error.message, { operation: "fetchTeamMemberBySlug", cause: error });
  return row ? getMemberFromRow(teamRowSchema.parse(row)) : null;
});
