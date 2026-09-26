"use client";

import { KeyRound, Save, UserX } from "lucide-react";
import { useId, useRef } from "react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { ROLE_OPTIONS } from "@/components/admin/users/role-options";
import { changeRoleAction, removeAccessAction, resetSignInCodesAction, restoreAccessAction } from "@/lib/admin/users/actions";
import type { AdminRole } from "@/lib/admin/require-admin-roles";
import type { SignInCodeStatus } from "@/lib/admin/users/queries";

const SIGN_IN_CODE_LABELS: Record<SignInCodeStatus, string> = {
  on: "Sign-in codes on",
  "not-set-up": "Hasn't finished setting up sign-in codes",
  unknown: "Sign-in code status unavailable right now",
};

export type UserListItem = { userId: string; email: string; role: AdminRole; signInCodes: SignInCodeStatus; isCurrentUser: boolean };

function UserRow({ user }: { user: UserListItem }) {
  const selectId = useId();
  const roleRef = useRef<HTMLSelectElement>(null);
  return (
    <li className="grid gap-3 border-t border-line py-4 md:grid-cols-12 md:items-end">
      <div className="md:col-span-4">
        <p className="font-bold break-all">
          {user.email}
          {user.isCurrentUser && " (you)"}
        </p>
        <p className="type-small text-muted">{SIGN_IN_CODE_LABELS[user.signInCodes]}</p>
      </div>
      <div className="md:col-span-3">
        <label htmlFor={selectId} className="mb-1 block text-base font-bold">
          Role
        </label>
        <select id={selectId} ref={roleRef} defaultValue={user.role} className="field-input">
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2 md:col-span-5 md:justify-end">
        <QuickActionButton label="Save role" accessibleLabel={`Save the role for ${user.email}`} icon={Save} onRun={() => changeRoleAction(user.userId, roleRef.current?.value ?? user.role)} />
        <QuickActionButton label="Reset sign-in codes" accessibleLabel={`Reset sign-in codes for ${user.email}`} icon={KeyRound} onRun={() => resetSignInCodesAction(user.userId)} />
        {!user.isCurrentUser && (
          <QuickActionButton
            label="Remove access"
            accessibleLabel={`Remove access for ${user.email}`}
            icon={UserX}
            onRun={() => removeAccessAction(user.userId)}
            undo={{ label: "Undo", onRun: () => restoreAccessAction(user.userId, user.role) }}
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
