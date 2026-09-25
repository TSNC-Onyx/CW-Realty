import { CircleCheck, CircleDot, Inbox, Reply, type LucideIcon } from "lucide-react";

import { STATUS_LABELS, type InboxStatus } from "@/lib/admin/inbox/inbox-labels";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

const STATUS_ICONS: Record<InboxStatus, LucideIcon> = { new: CircleDot, assigned: Inbox, replied: Reply, closed: CircleCheck };

// Status shown with an icon and a word, never color alone (Style §2).
export function InboxStatusLabel({ status }: { status: InboxStatus }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span className="type-small inline-flex items-center gap-1.5 font-semibold">
      <Icon aria-hidden size={ICON_SIZE.inline} />
      {STATUS_LABELS[status]}
    </span>
  );
}
