import { ROLE_LABELS } from "@/lib/admin/require-admin-roles";

export const ROLE_OPTIONS = (["owner", "manager", "staff"] as const).map((role) => ({ value: role, label: ROLE_LABELS[role] }));
