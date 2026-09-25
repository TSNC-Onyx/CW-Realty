import { EDITOR_ROLES, OWNER_ROLES, ALL_ROLES, type AdminRole } from "@/lib/admin/require-admin-roles";

// Admin areas and who can use them (parent plan, "Role access"). Inbox, notifications,
// and the chatbot policy join in Phases 4 and 5.

export type AdminArea = {
  key: string;
  label: string;
  href: string;
  description: string;
  roles: AdminRole[];
};

export const ADMIN_AREAS: AdminArea[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin", description: "", roles: ALL_ROLES },
  { key: "listings", label: "Listings", href: "/admin/listings", description: "Add, edit, reorder, and publish featured properties.", roles: EDITOR_ROLES },
  { key: "team", label: "Team", href: "/admin/team", description: "Update profiles, photos, order, and who is shown.", roles: EDITOR_ROLES },
  { key: "contact", label: "Contact & footer", href: "/admin/contact", description: "Phone, email, contact names, office address, and footer text.", roles: EDITOR_ROLES },
  { key: "trash", label: "Trash", href: "/admin/trash", description: "Restore anything deleted in the last 30 days.", roles: EDITOR_ROLES },
  { key: "users", label: "Users & roles", href: "/admin/users", description: "Invite people and choose what they can change.", roles: OWNER_ROLES },
];

export function getAreasForRole(role: AdminRole): AdminArea[] {
  return ADMIN_AREAS.filter((area) => area.roles.includes(role));
}

export function isCurrentArea(pathname: string, area: AdminArea): boolean {
  if (area.href === "/admin") return pathname === "/admin";
  return pathname === area.href || pathname.startsWith(`${area.href}/`);
}
