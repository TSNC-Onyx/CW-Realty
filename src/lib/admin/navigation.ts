import { EDITOR_ROLES, OWNER_ROLES, ALL_ROLES, type AdminRole } from "@/lib/admin/require-admin-roles";

// Admin areas and who can use them (parent plan, "Role access").

export type AdminAreaGroup = "daily" | "website" | "settings";

export type AdminArea = {
  key: string;
  label: string;
  href: string;
  description: string;
  group: AdminAreaGroup;
  roles: AdminRole[];
};

/** Sidebar and phone-menu sections, in display order. */
export const ADMIN_AREA_GROUPS: { key: AdminAreaGroup; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "website", label: "Website" },
  { key: "settings", label: "Settings" },
];

export const ADMIN_AREAS: AdminArea[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin", description: "", group: "daily", roles: ALL_ROLES },
  { key: "inbox", label: "Inbox", href: "/admin/inbox", description: "Answer contact, TouchUp, and chat requests.", group: "daily", roles: ALL_ROLES },
  { key: "listings", label: "Listings", href: "/admin/listings", description: "Add, edit, reorder, and publish featured properties.", group: "website", roles: EDITOR_ROLES },
  { key: "team", label: "Team", href: "/admin/team", description: "Update profiles, photos, order, and who is shown.", group: "website", roles: EDITOR_ROLES },
  { key: "contact", label: "Contact & footer", href: "/admin/contact", description: "Phone, email, contact names, office address, and footer text.", group: "website", roles: EDITOR_ROLES },
  { key: "notifications", label: "Notifications", href: "/admin/notifications", description: "Choose who gets email alerts, and check they arrive.", group: "settings", roles: EDITOR_ROLES },
  { key: "chat-policy", label: "Chatbot policy", href: "/admin/chat-policy", description: "Write, test, and publish what the chat assistant may answer.", group: "settings", roles: OWNER_ROLES },
  { key: "chats", label: "Chat history", href: "/admin/chats", description: "Read what visitors asked the chat assistant, for the weekly review.", group: "daily", roles: EDITOR_ROLES },
  { key: "trash", label: "Trash", href: "/admin/trash", description: "Restore anything deleted in the last 30 days.", group: "settings", roles: EDITOR_ROLES },
  { key: "users", label: "Users & roles", href: "/admin/users", description: "Invite people and choose what they can change.", group: "settings", roles: OWNER_ROLES },
];

export function getAreasForRole(role: AdminRole): AdminArea[] {
  return ADMIN_AREAS.filter((area) => area.roles.includes(role));
}

/** The area a portal URL belongs to, for the top-bar breadcrumb; undefined for unknown paths. */
export function getAreaForPath(pathname: string): AdminArea | undefined {
  return ADMIN_AREAS.find((area) => isCurrentArea(pathname, area));
}

export function isCurrentArea(pathname: string, area: AdminArea): boolean {
  if (area.href === "/admin") return pathname === "/admin";
  return pathname === area.href || pathname.startsWith(`${area.href}/`);
}
