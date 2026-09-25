// Admin roles (cwr.member_role), usable from both server and browser code.

export type AdminRole = "owner" | "manager" | "staff";

export const EDITOR_ROLES: AdminRole[] = ["owner", "manager"];
export const OWNER_ROLES: AdminRole[] = ["owner"];
export const ALL_ROLES: AdminRole[] = ["owner", "manager", "staff"];

export const ROLE_LABELS: Record<AdminRole, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };
