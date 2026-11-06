"use client";

import { Pencil, Save } from "lucide-react";
import { useRef, type RefObject } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { QuickActionButton } from "@/components/admin/quick-action-button";
import { getButtonClassName } from "@/components/ui/button-link";
import { changeNameAction } from "@/lib/admin/users/actions";
import { MAX_NAME_LENGTH } from "@/lib/admin/users/name-schema";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// "Add name" / "Edit name" on a Users & roles row, and the small form it opens on its own line
// under the row. The name is the login's, shared with 623 Summit, so a change shows on both sites.

type NamedUser = { userId: string; email: string; firstName: string | null; lastName: string | null };

const SECONDARY_BUTTON = `${getButtonClassName({ size: "s", variant: "secondary" })} px-3`;

export function NameButton({ user, openerRef, onOpen }: { user: NamedUser; openerRef: RefObject<HTMLButtonElement | null>; onOpen: () => void }) {
  const label = user.firstName || user.lastName ? "Edit name" : "Add name";
  return (
    <button ref={openerRef} type="button" onClick={onOpen} aria-label={`${label} for ${user.email}`} className={SECONDARY_BUTTON}>
      <Pencil aria-hidden size={ICON_SIZE.button} />
      {label}
    </button>
  );
}

export function NameForm({ user, onClose }: { user: NamedUser; onClose: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);

  const saveName = async () => {
    const values = new FormData(formRef.current ?? undefined);
    const result = await changeNameAction({ userId: user.userId, firstName: String(values.get("firstName") ?? ""), lastName: String(values.get("lastName") ?? "") });
    if (result.status === "success") onClose();
    return result;
  };

  return (
    <form ref={formRef} onSubmit={(event) => event.preventDefault()} aria-label={`Name for ${user.email}`} className="grid max-w-form gap-4 border border-line p-4 md:grid-cols-2">
      <AdminField name="firstName" label="First name" defaultValue={user.firstName ?? ""} autoComplete="off" maxLength={MAX_NAME_LENGTH} />
      <AdminField name="lastName" label="Last name" defaultValue={user.lastName ?? ""} autoComplete="off" maxLength={MAX_NAME_LENGTH} />
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <QuickActionButton label="Save name" accessibleLabel={`Save the name for ${user.email}`} icon={Save} problemAction="users.change_name" onRun={saveName} />
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
          Keep as is
        </button>
      </div>
    </form>
  );
}
