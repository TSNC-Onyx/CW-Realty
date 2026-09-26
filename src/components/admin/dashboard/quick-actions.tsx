import { KeyRound, Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { getButtonClassName } from "@/components/ui/button-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Shortcuts to the most common edits; only actions the role may use are passed in.
// The first is the section's one main button (Style §11.5).

export type QuickAction = { key: string; label: string; href: string; icon: LucideIcon };

export const QUICK_ACTIONS: Record<string, QuickAction> = {
  listings: { key: "listings", label: "Add a listing", href: "/admin/listings/new", icon: Plus },
  team: { key: "team", label: "Add a team member", href: "/admin/team/new", icon: Plus },
  users: { key: "users", label: "Invite a person", href: "/admin/users#invite-heading", icon: KeyRound },
};

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <section aria-labelledby="quick-heading" className="grid content-start gap-3 border-t-2 border-ink bg-surface-soft p-6">
      <h2 id="quick-heading" className="type-h3 mb-1">
        Quick actions
      </h2>
      {actions.map(({ key, label, href, icon: Icon }, index) => (
        <Link key={key} href={href} className={`${getButtonClassName({ size: "m", variant: index === 0 ? "main" : "secondary" })} justify-start`}>
          <Icon aria-hidden size={ICON_SIZE.button} />
          {label}
        </Link>
      ))}
    </section>
  );
}
