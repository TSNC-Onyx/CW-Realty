import { ExternalLink, Inbox } from "lucide-react";
import Link from "next/link";

import type { AdminAccountSummary } from "@/components/admin/frame/admin-account";
import { AdminBreadcrumb } from "@/components/admin/frame/admin-breadcrumb";
import { AdminMobileMenu } from "@/components/admin/frame/admin-mobile-menu";
import { SignOutButton } from "@/components/admin/frame/sign-out-button";
import { UnreadBadge } from "@/components/admin/frame/unread-badge";
import { Logo } from "@/components/layout/logo";
import { ADMIN_HOME_PATH } from "@/lib/admin/paths";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Style §11.13 admin top bar: sticky and dark, 62px on phones and tablets, 88px on desktop.
// Desktop: logo, title, breadcrumb, "View website", Sign out. Phones: logo, Inbox, Menu.

const PUBLIC_HOME_PATH = "/";
const INBOX_PATH = "/admin/inbox";

type AdminTopBarProps = { areaKeys: string[]; unreadCount: number; account: AdminAccountSummary };

function InboxShortcut({ unreadCount }: { unreadCount: number }) {
  return (
    <Link href={INBOX_PATH} className="relative flex size-11 items-center justify-center lg:hidden">
      <Inbox aria-hidden size={ICON_SIZE.actionBar} />
      <span className="sr-only">Inbox</span>
      <span className="absolute -top-1 -right-1 flex">
        <UnreadBadge count={unreadCount} />
      </span>
    </Link>
  );
}

function ViewWebsiteLink() {
  return (
    <a href={PUBLIC_HOME_PATH} target="_blank" rel="noopener noreferrer" className="text-link hidden px-3 text-sm lg:inline-flex">
      View website
      <span className="sr-only">(opens in a new tab)</span>
      <ExternalLink aria-hidden size={ICON_SIZE.inline} />
    </a>
  );
}

export function AdminTopBar({ areaKeys, unreadCount, account }: AdminTopBarProps) {
  return (
    <header className="tone-dark sticky top-0 z-40 border-b border-divider-dark">
      <div className="flex h-15.5 items-center gap-3 px-4 lg:h-22 lg:gap-10 lg:px-8">
        <div className="flex items-center gap-3 lg:gap-4">
          <Logo placement="header" href={ADMIN_HOME_PATH} />
          <p className="grid">
            <span className="hidden font-display text-xl leading-snug font-medium lg:block">CWR Real Estate</span>
            <span className="font-display text-xl font-medium lg:type-eyebrow lg:text-on-dark-muted">Admin</span>
          </p>
        </div>
        <AdminBreadcrumb />
        <div className="ml-auto flex items-center gap-2">
          <ViewWebsiteLink />
          <SignOutButton size="s" className="hidden lg:block" />
          <InboxShortcut unreadCount={unreadCount} />
          <AdminMobileMenu areaKeys={areaKeys} unreadCount={unreadCount} account={account} />
        </div>
      </div>
    </header>
  );
}
