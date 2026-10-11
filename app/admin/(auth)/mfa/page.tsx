import { redirect } from "next/navigation";

import { getSafeAdminPath } from "@/lib/admin/paths";

// Sign-in codes were removed (owner choice 2026-10-09, docs/cwr-password-only-sign-in-plan.md).
// Old bookmarks and email links land here: forward to where they were going (the admin pages
// send anyone signed out to sign in).
export default async function OldCodePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  redirect(getSafeAdminPath(next));
}
