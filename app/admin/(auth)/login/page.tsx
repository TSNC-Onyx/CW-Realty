import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/auth/login-form";
import { getButtonClassName } from "@/components/ui/button-link";
import { Message, type MessageTone } from "@/components/ui/message";
import { fetchSignInStage } from "@/lib/admin/auth-pages";
import { ADMIN_HOME_PATH, ADMIN_LOGOUT_PATH, getSafeAdminPath } from "@/lib/admin/paths";

export const metadata: Metadata = { title: "Sign in" };

const REASON_MESSAGES: Record<string, { tone: MessageTone; title: string; body: string }> = {
  timeout: { tone: "info", title: "You were signed out to keep the account safe", body: "Sessions end after 30 minutes without activity, or 12 hours after signing in. Sign in again to continue." },
  "signed-out": { tone: "success", title: "You're signed out", body: "Close this window if you're on a shared computer." },
  "no-access": { tone: "warning", title: "This account doesn't have access", body: "Ask the site owner to invite you to the CWR admin portal." },
  "link-expired": { tone: "warning", title: "That link has expired or was already used", body: "Ask for a new invite, or use “Forgot your password?” to get a new link." },
};

type LoginPageProps = { searchParams: Promise<{ reason?: string; next?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { reason, next } = await searchParams;
  const stage = await fetchSignInStage();
  if (stage === "verified" && reason === undefined) redirect(ADMIN_HOME_PATH);
  const reasonMessage = reason ? REASON_MESSAGES[reason] : undefined;
  return (
    <>
      <h1 className="type-h1 mb-6">Sign in</h1>
      {reasonMessage && (
        <div className="mb-6">
          <Message tone={reasonMessage.tone} title={reasonMessage.title}>
            <p>{reasonMessage.body}</p>
          </Message>
        </div>
      )}
      {stage !== "signed-out" && (
        <form action={`${ADMIN_LOGOUT_PATH}?reason=signed-out`} method="post" className="mb-6">
          <button type="submit" className={getButtonClassName({ size: "m", variant: "secondary" })}>
            Sign out of this account
          </button>
        </form>
      )}
      <LoginForm next={getSafeAdminPath(next)} />
    </>
  );
}
