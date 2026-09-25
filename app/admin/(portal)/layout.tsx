import { LogOut } from "lucide-react";

import { AdminNav } from "@/components/admin/admin-nav";
import { IdleTimer } from "@/components/admin/idle-timer";
import { ToastProvider } from "@/components/admin/toast-provider";
import { getButtonClassName } from "@/components/ui/button-link";
import { getAreasForRole } from "@/lib/admin/navigation";
import { ADMIN_LOGOUT_PATH } from "@/lib/admin/paths";
import { ROLE_LABELS } from "@/lib/admin/require-admin-roles";
import { ALL_ROLES, requireAdminPage } from "@/lib/admin/require-admin";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Signed-in admin frame: every page under it has already passed the aal2 + membership check.
export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdminPage(ALL_ROLES);
  const areaKeys = getAreasForRole(admin.role).map((area) => area.key);
  return (
    <ToastProvider>
      <a href="#main" className="sr-only bg-ink font-bold text-on-dark focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:px-4">
        Skip to main content
      </a>
      <header className="border-b border-line bg-page">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 md:px-8">
          <p className="font-display text-menu font-medium">CWR admin</p>
          <AdminNav areaKeys={areaKeys} />
          <div className="flex items-center gap-4">
            <p className="type-small text-muted">
              <span className="break-all">{admin.email}</span> · {ROLE_LABELS[admin.role]}
            </p>
            <form action={ADMIN_LOGOUT_PATH} method="post">
              <button type="submit" className={getButtonClassName({ size: "s", variant: "secondary" })}>
                <LogOut aria-hidden size={ICON_SIZE.button} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-content px-4 py-8 outline-none md:px-8 lg:py-12">
        {children}
      </main>
      <IdleTimer />
    </ToastProvider>
  );
}
