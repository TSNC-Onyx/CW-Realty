"use client";

import { LayoutDashboard, RotateCw } from "lucide-react";
import Link from "next/link";

import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { ADMIN_HOME_PATH } from "@/lib/admin/paths";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Shown in place of an admin page that failed to load; the top bar, sidebar, and
// Sign out keep working (Infra §3 "fail gracefully"). Nothing typed is lost elsewhere.
export default function AdminPageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <h1 className="type-h1 mb-6">This page didn&apos;t load</h1>
      <div className="max-w-prose">
        <Message tone="error" title="We couldn't load this page">
          <p>Try again in a moment. If it keeps happening, tell the site owner which page you were opening.</p>
        </Message>
      </div>
      <div className="mt-6 flex flex-wrap gap-4">
        <button type="button" onClick={reset} className={getButtonClassName({ size: "m", variant: "main" })}>
          <RotateCw aria-hidden size={ICON_SIZE.button} />
          Try again
        </button>
        <Link href={ADMIN_HOME_PATH} className={getButtonClassName({ size: "m", variant: "secondary" })}>
          <LayoutDashboard aria-hidden size={ICON_SIZE.button} />
          Go to the dashboard
        </Link>
      </div>
    </>
  );
}
