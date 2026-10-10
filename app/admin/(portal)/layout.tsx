import { AdminSidebar } from "@/components/admin/frame/admin-sidebar";
import { AdminTopBar } from "@/components/admin/frame/admin-top-bar";
import { IdleTimer } from "@/components/admin/idle-timer";
import { ProblemReporter } from "@/components/admin/problem-reporter";
import { ToastProvider } from "@/components/admin/toast-provider";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/layout/skip-link";
import { fetchUnreadCount } from "@/lib/admin/inbox/queries";
import { getAreasForRole } from "@/lib/admin/navigation";
import { reportPageLoad } from "@/lib/admin/report-page-load";
import { ALL_ROLES, requireAdminPage } from "@/lib/admin/require-admin";

// The badge hides at zero, so an unknown count shows no badge rather than a wrong number.
const NO_BADGE_COUNT = 0;

// Signed-in admin frame: every page under it has already passed the sign-in + membership check.
// Dark top bar across the page; grouped sidebar on desktop, Menu on phones and tablets.
export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdminPage(ALL_ROLES);
  const areaKeys = getAreasForRole(admin.role).map((area) => area.key);
  const unread = await fetchUnreadCount(admin);
  await reportPageLoad({ admin, action: "portal.load_frame", results: [unread] });
  const unreadCount = unread.isLoaded ? unread.data : NO_BADGE_COUNT;
  const account = { email: admin.email, role: admin.role };
  return (
    <ToastProvider>
      <SkipLink />
      <AdminTopBar areaKeys={areaKeys} unreadCount={unreadCount} account={account} />
      <div className="flex">
        <AdminSidebar areaKeys={areaKeys} unreadCount={unreadCount} account={account} />
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto w-full max-w-content min-w-0 px-4 py-8 outline-none md:px-8 lg:px-12 lg:py-10">
          {children}
        </main>
      </div>
      <IdleTimer />
      <ProblemReporter userId={admin.userId} action="portal.browser_error" />
    </ToastProvider>
  );
}
