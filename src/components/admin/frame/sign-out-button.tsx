import { LogOut } from "lucide-react";

import { getButtonClassName, type ButtonSize } from "@/components/ui/button-link";
import { ADMIN_LOGOUT_PATH } from "@/lib/admin/paths";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// A full-page form post, so the unsaved-changes warning (beforeunload) still guards edits.
export function SignOutButton({ size, className = "" }: { size: ButtonSize; className?: string }) {
  return (
    <form action={ADMIN_LOGOUT_PATH} method="post" className={className}>
      <button type="submit" className={`${getButtonClassName({ size, variant: "secondary", tone: "dark" })} w-full`}>
        <LogOut aria-hidden size={ICON_SIZE.button} />
        Sign out
      </button>
    </form>
  );
}
