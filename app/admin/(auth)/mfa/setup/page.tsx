import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MfaSetup } from "@/components/admin/auth/mfa-setup";
import { fetchHasVerifiedFactor, requirePasswordOnlyStage } from "@/lib/admin/auth-pages";
import { ADMIN_MFA_PATH, getSafeAdminPath } from "@/lib/admin/paths";

export const metadata: Metadata = { title: "Set up sign-in codes" };

export default async function MfaSetupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  await requirePasswordOnlyStage();
  if (await fetchHasVerifiedFactor()) redirect(ADMIN_MFA_PATH);
  return (
    <>
      <h1 className="type-h1 mb-2">Set up sign-in codes</h1>
      <p className="type-lead mb-6">Every CWR admin account uses a password plus a code from an app on your phone.</p>
      <MfaSetup next={getSafeAdminPath(next)} />
    </>
  );
}
