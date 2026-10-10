import { redirect } from "next/navigation";

import { getSafeAdminPath } from "@/lib/admin/paths";

// Sign-in codes were removed (owner choice 2026-10-09, docs/cwr-password-only-sign-in-plan.md):
// the old setup page forwards like /admin/mfa.
export default async function OldCodeSetupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  redirect(getSafeAdminPath(next));
}
