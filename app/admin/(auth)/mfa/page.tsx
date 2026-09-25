import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MfaForm } from "@/components/admin/auth/mfa-form";
import { fetchHasVerifiedFactor, requirePasswordOnlyStage } from "@/lib/admin/auth-pages";
import { ADMIN_MFA_SETUP_PATH, getSafeAdminPath } from "@/lib/admin/paths";

export const metadata: Metadata = { title: "Enter your code" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  await requirePasswordOnlyStage();
  if (!(await fetchHasVerifiedFactor())) redirect(ADMIN_MFA_SETUP_PATH);
  return (
    <>
      <h1 className="type-h1 mb-6">Enter your code</h1>
      <MfaForm next={getSafeAdminPath(next)} />
    </>
  );
}
