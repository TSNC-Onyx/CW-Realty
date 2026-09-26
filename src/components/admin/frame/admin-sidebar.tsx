import { AdminAccount, type AdminAccountSummary } from "@/components/admin/frame/admin-account";
import { AdminNavLinks } from "@/components/admin/frame/admin-nav-links";

// Style §11.13 admin sidebar (desktop, 1024px and up): grouped links above, the signed-in
// email and role pinned at the bottom. Sticky under the top bar and scrolls on its own.

type AdminSidebarProps = { areaKeys: string[]; unreadCount: number; account: AdminAccountSummary };

export function AdminSidebar({ areaKeys, unreadCount, account }: AdminSidebarProps) {
  return (
    <aside aria-label="Admin sections" className="admin-sidebar tone-dark sticky hidden w-64 shrink-0 flex-col lg:flex">
      <div className="flex-1 overflow-y-auto pb-6">
        <AdminNavLinks areaKeys={areaKeys} unreadCount={unreadCount} layout="sidebar" />
      </div>
      <div className="shrink-0 border-t border-divider-dark px-6 py-5">
        <AdminAccount account={account} emailFit="truncate" />
      </div>
    </aside>
  );
}
