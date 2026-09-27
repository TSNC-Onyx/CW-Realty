import { cache } from "react";
import { z } from "zod";

import { CONNECTION_CATEGORIES, type ConnectionCategory } from "@/lib/content/connection-categories";
import type { E164Phone } from "@/lib/site/phone";
import { CWR_TENANT_SLUG, SupabaseQueryError, getPublicClient } from "@/lib/supabase/public-client";

// Visible referral partners in the order staff set in Admin → Connections. Row Level
// Security hides hidden and deleted ones.

const MAX_CONNECTIONS = 100;

const CONNECTION_COLUMNS =
  "id, full_name, category, title_line, phone, email, website, photo_path, photo_alt, photo_width, photo_height, tenants!inner(slug)";

const connectionRowSchema = z.object({
  id: z.uuid(),
  full_name: z.string(),
  category: z.enum(CONNECTION_CATEGORIES),
  title_line: z.string(),
  phone: z.string().regex(/^\+1[2-9][0-9]{9}$/).nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  photo_path: z.string().nullable(),
  photo_alt: z.string().nullable(),
  photo_width: z.number().int().nullable(),
  photo_height: z.number().int().nullable(),
});

type ConnectionRow = z.infer<typeof connectionRowSchema>;

export type ConnectionPhoto = { folder: string; alt: string; width: number; height: number };

export type Connection = {
  id: string;
  fullName: string;
  category: ConnectionCategory;
  titleLine: string;
  phone: E164Phone | null;
  email: string | null;
  website: string | null;
  photo: ConnectionPhoto | null;
};

function getPhotoFromRow({ photo_path, photo_alt, photo_width, photo_height }: ConnectionRow): ConnectionPhoto | null {
  if (!photo_path || !photo_alt || !photo_width || !photo_height) return null;
  return { folder: photo_path, alt: photo_alt, width: photo_width, height: photo_height };
}

function getConnectionFromRow(row: ConnectionRow): Connection {
  return {
    id: row.id,
    fullName: row.full_name,
    category: row.category,
    titleLine: row.title_line,
    phone: row.phone as E164Phone | null,
    email: row.email,
    website: row.website,
    photo: getPhotoFromRow(row),
  };
}

function getSentenceCaseList(items: string[]): string {
  const [first, ...rest] = items.map((item, index) => (index === 0 ? item : item.toLowerCase()));
  if (rest.length === 0) return first ?? "";
  if (rest.length === 1) return `${first} and ${rest[0]}`;
  return `${[first, ...rest.slice(0, -1)].join(", ")}, and ${rest[rest.length - 1]}`;
}

/** "Lending and insurance": the categories present, in CONNECTION_CATEGORIES order. */
export function getCategoriesHeading(connections: Connection[]): string {
  const presentCategories = CONNECTION_CATEGORIES.filter((category) => connections.some((connection) => connection.category === category));
  return getSentenceCaseList([...presentCategories]);
}

/** Throws SupabaseQueryError when the database fails. */
export const fetchConnections = cache(async (): Promise<Connection[]> => {
  const client = getPublicClient();
  if (!client) return [];
  const { data: rows, error } = await client
    .from("connections")
    .select(CONNECTION_COLUMNS)
    .eq("tenants.slug", CWR_TENANT_SLUG)
    .order("sort_order")
    .order("full_name")
    .limit(MAX_CONNECTIONS);
  if (error) throw new SupabaseQueryError(error.message, { operation: "fetchConnections", cause: error });
  return z.array(connectionRowSchema).parse(rows).map(getConnectionFromRow);
});
