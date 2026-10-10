"use client";

import { Save, UserX } from "lucide-react";
import { useId, useRef } from "react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { SavedStateLine, useTypedValue } from "@/components/admin/saved-state";
import { ROLE_OPTIONS } from "@/components/admin/users/role-options";
import { changeRoleAction, removeAccessAction, restoreAccessAction } from "@/lib/admin/users/actions";
import type { AdminRole } from "@/lib/admin/require-admin-roles";
import { getSavedState } from "@/lib/admin/saved-state";

export type UserListItem = { userId: string; email: string; role: AdminRole; isCurrentUser: boolean };

function UserRow({ user }: { user: UserListItem }) {
  const selectId = useId();
  const roleRef = useRef<HTMLSelectElement>(null);
  const [typedRole, setTypedRole] = useTypedValue(user.role);
  return (
    <li className="grid gap-3 border-t border-line py-4 md:grid-cols-12 md:items-end">
      <div className="md:col-span-4">
        <p className="font-bold break-all">
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
