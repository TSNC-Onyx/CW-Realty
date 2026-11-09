"use client";

import { Save, UserX } from "lucide-react";
import { useId, useRef, useState } from "react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { SavedStateLine, useTypedValue } from "@/components/admin/saved-state";
import { NameButton, NameForm } from "@/components/admin/users/name-editor";
import { ROLE_OPTIONS } from "@/components/admin/users/role-options";
import { changeRoleAction, removeAccessAction, restoreAccessAction } from "@/lib/admin/users/actions";
import type { AdminRole } from "@/lib/admin/require-admin-roles";
import { getSavedState } from "@/lib/admin/saved-state";

export type UserListItem = { userId: string; email: string; firstName: string | null; lastName: string | null; role: AdminRole; isCurrentUser: boolean };

function UserRow({ user }: { user: UserListItem }) {
  const selectId = useId();
  const roleRef = useRef<HTMLSelectElement>(null);
  const [typedRole, setTypedRole] = useTypedValue(user.role);
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const [isNameOpen, setIsNameOpen] = useState(false);
  const nameOpenerRef = useRef<HTMLButtonElement>(null);
  const closeName = () => {
    setIsNameOpen(false);
    requestAnimationFrame(() => nameOpenerRef.current?.focus());
  };
  return (
    <li className="grid gap-3 border-t border-line py-4 md:grid-cols-12 md:items-end">
      <div className="md:col-span-4">
        {displayName && <p className="font-bold break-words">{displayName}</p>}
        <p className={`${displayName ? "text-muted" : "font-bold"} break-all`}>
          {user.email}
          {user.isCurrentUser && " (you)"}
        </p>
      </div>
      <div className="md:col-span-3">
        <label htmlFor={selectId} className="mb-1 block text-base font-bold">
          Role
        </label>
        <select
          key={user.role}
          id={selectId}
          ref={roleRef}
          defaultValue={user.role}
          onChange={(event) => setTypedRole(event.target.value)}
          aria-describedby={`${selectId}-saved`}
          className="field-input"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <SavedStateLine id={`${selectId}-saved`} state={getSavedState({ current: typedRole, saved: user.role })} />
      </div>
      <div className="flex flex-wrap gap-2 md:col-span-5 md:justify-end">
        <QuickActionButton label="Save role" accessibleLabel={`Save the role for ${user.email}`} icon={Save} problemAction="users.change_role" onRun={() => changeRoleAction(user.userId, roleRef.current?.value ?? user.role)} />
        <NameButton user={user} openerRef={nameOpenerRef} onOpen={() => setIsNameOpen(true)} />
        {!user.isCurrentUser && (
          <QuickActionButton
            label="Remove access"
            accessibleLabel={`Remove access for ${user.email}`}
            icon={UserX}
            problemAction="users.remove_access"
            onRun={() => removeAccessAction(user.userId)}
            undo={{ label: "Undo", problemAction: "users.restore_access", onRun: () => restoreAccessAction(user.userId, user.role) }}
          />
        )}
      </div>
      {isNameOpen && (
        <div className="md:col-span-12">
          <NameForm user={user} onClose={closeName} />
        </div>
      )}
    </li>
  );
}

export function UserList({ users }: { users: UserListItem[] }) {
  return (
    <ul className="border-b border-line">
      {users.map((user) => (
        <UserRow key={user.userId} user={user} />
      ))}
    </ul>
  );
}
