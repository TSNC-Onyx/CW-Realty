import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { fetchListingSlugs } from "@/lib/content/listings";
import { fetchTeamMembers } from "@/lib/content/team";
import { SITE_URL, getListedPagePaths } from "@/lib/site/navigation";
import { fetchPageListing } from "@/lib/site/page-listing";

// Fixed pages (minus any an owner has hidden) plus every live listing and visible team member
// (navigation-reconciliation #1).
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
  const [listing, recordPaths] = await Promise.all([fetchPageListing(), fetchRecordPaths()]);
  const paths = [...getListedPagePaths(listing), ...recordPaths];
  return paths.map((path) => ({ url: `${SITE_URL}${path === "/" ? "" : path}` }));
}
