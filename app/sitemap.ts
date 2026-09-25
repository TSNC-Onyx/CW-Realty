import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { fetchListingSlugs } from "@/lib/content/listings";
import { fetchTeamMembers } from "@/lib/content/team";
import { SITE_URL, STATIC_PAGE_PATHS } from "@/lib/site/navigation";

// Fixed pages plus every live listing and visible team member (navigation-reconciliation #1).
// If the database is unavailable the fixed pages are still listed.

async function fetchRecordPaths(): Promise<string[]> {
  try {
    const [listingSlugs, members] = await Promise.all([fetchListingSlugs(), fetchTeamMembers()]);
    return [...listingSlugs.map((slug) => `/listings/${slug}`), ...members.map((member) => `/team/${member.slug}`)];
  } catch (error) {
    console.error("Sitemap records unavailable", error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const paths = [...STATIC_PAGE_PATHS, ...(await fetchRecordPaths())];
  return paths.map((path) => ({ url: `${SITE_URL}${path === "/" ? "" : path}` }));
}
