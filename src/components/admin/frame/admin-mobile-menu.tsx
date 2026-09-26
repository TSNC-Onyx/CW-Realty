"use client";

import { Menu, X } from "lucide-react";
import { useRef } from "react";

import { AdminAccount, type AdminAccountSummary } from "@/components/admin/frame/admin-account";
import { AdminNavLinks } from "@/components/admin/frame/admin-nav-links";
import { SignOutButton } from "@/components/admin/frame/sign-out-button";
import { Logo } from "@/components/layout/logo";
import { getButtonClassName } from "@/components/ui/button-link";
import { ADMIN_HOME_PATH } from "@/lib/admin/paths";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Phones and tablets: the same full-screen dark menu pattern as the public site (§11.9).
// A native modal <dialog> traps focus, closes on Escape, and returns focus to "Menu".

type AdminMobileMenuProps = { areaKeys: string[]; unreadCount: number; account: AdminAccountSummary };

export function AdminMobileMenu({ areaKeys, unreadCount, account }: AdminMobileMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const handleOpen = () => dialogRef.current?.showModal();
  const handleClose = () => dialogRef.current?.close();

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={handleOpen} className={`${getButtonClassName({ size: "s", variant: "secondary", tone: "dark" })} px-3 lg:hidden`}>
        <Menu aria-hidden size={ICON_SIZE.button} />
        Menu
      </button>
      <dialog ref={dialogRef} aria-label="Admin menu" className="menu-dialog tone-dark m-0 h-dvh max-h-none w-full max-w-none border-0 p-0 lg:hidden">
        <div className="flex h-full flex-col">
          <div className="flex h-15.5 shrink-0 items-center gap-3 border-b border-divider-menu px-4">
            <Logo placement="header" href={ADMIN_HOME_PATH} onNavigate={handleClose} />
            <span className="font-display text-xl font-medium">Admin</span>
            <button type="button" onClick={handleClose} className={`${getButtonClassName({ size: "s", variant: "secondary", tone: "dark" })} ml-auto`}>
              <X aria-hidden size={ICON_SIZE.button} />
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <AdminNavLinks areaKeys={areaKeys} unreadCount={unreadCount} layout="menu" onNavigate={handleClose} />
          </div>
          <div className="grid shrink-0 gap-4 border-t border-divider-menu p-4">
            <AdminAccount account={account} emailFit="wrap" />
            <SignOutButton size="l" />
          </div>
        </div>
      </dialog>
    </>
  );
}
