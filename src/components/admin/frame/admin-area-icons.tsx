import { BookOpen, Bell, ChartColumn, Circle, Handshake, House, Inbox, KeyRound, LayoutDashboard, MessagesSquare, Phone, Trash2, Users, type LucideIcon } from "lucide-react";

// Style §11.6: each admin area pairs its word with one outline icon (never the icon alone).

const ADMIN_AREA_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  chats: MessagesSquare,
  listings: House,
  team: Users,
  contact: Phone,
  notifications: Bell,
  "chat-policy": BookOpen,
  "closed-deals": Handshake,
  tracking: ChartColumn,
  users: KeyRound,
  trash: Trash2,
};

export function AreaIcon({ areaKey, size, className }: { areaKey: string; size: number; className?: string }) {
  const Icon = ADMIN_AREA_ICONS[areaKey] ?? Circle;
  return <Icon aria-hidden size={size} className={className} />;
}
