"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { getButtonClassName } from "@/components/ui/button-link";
import { moveConnectionAction, setConnectionVisibilityAction } from "@/lib/admin/connections/actions";
import { moveToTrashAction, restoreFromTrashAction } from "@/lib/admin/trash/actions";
import type { ConnectionPhoto } from "@/lib/content/connections";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Admin → Connections list (owner-approved design 2026-09-26): photo, name, category and
// title, Shown/Hidden with an icon and the word, then the same actions as Team.

const THUMBNAIL_SIZES = "48px";

export type ConnectionListItem = {
  id: string;
  fullName: string;
  category: string;
  titleLine: string;
  isVisible: boolean;
  photo: ConnectionPhoto | null;
};

function VisibilityStatus({ isVisible }: { isVisible: boolean }) {
  const Icon = isVisible ? Eye : EyeOff;
  return (
    <p className="type-small flex items-center gap-2">
      <Icon aria-hidden size={ICON_SIZE.inline} />
      {isVisible ? "Shown" : "Hidden"}
    </p>
  );
}

function ConnectionRow({ connection, isFirst, isLast }: { connection: ConnectionListItem; isFirst: boolean; isLast: boolean }) {
  const trashTarget = { table: "connections" as const, id: connection.id };
  const details = [connection.category, connection.titleLine].filter(Boolean).join(" · ");
  return (
    <li className="grid gap-3 border-t border-line py-4 md:grid-cols-12 md:items-center">
      <div className="flex items-center gap-4 md:col-span-5">
        <div className="w-12 shrink-0">
          <ResponsivePhoto photo={connection.photo} ratio="portrait" sizes={THUMBNAIL_SIZES} />
        </div>
        <div>
          <p className="font-bold">{connection.fullName}</p>
          <p className="type-small text-muted">{details}</p>
        </div>
      </div>
      <div className="md:col-span-2">
        <VisibilityStatus isVisible={connection.isVisible} />
      </div>
      <div className="flex flex-wrap gap-2 md:col-span-5 md:justify-end">
        <Link href={`/admin/connections/${connection.id}`} className={`${getButtonClassName({ size: "s", variant: "main" })} px-3`}>
          <Pencil aria-hidden size={ICON_SIZE.button} />
          Edit
          <span className="sr-only">{connection.fullName}</span>
        </Link>
        <QuickActionButton label="Up" accessibleLabel={`Move ${connection.fullName} up`} icon={ArrowUp} isDisabled={isFirst} problemAction="connections.move" onRun={() => moveConnectionAction(connection.id, "up")} />
        <QuickActionButton label="Down" accessibleLabel={`Move ${connection.fullName} down`} icon={ArrowDown} isDisabled={isLast} problemAction="connections.move" onRun={() => moveConnectionAction(connection.id, "down")} />
        <QuickActionButton
          label={connection.isVisible ? "Hide" : "Show"}
          accessibleLabel={`${connection.isVisible ? "Hide" : "Show"} ${connection.fullName}`}
          icon={connection.isVisible ? EyeOff : Eye}
          problemAction="connections.set_visibility"
          onRun={() => setConnectionVisibilityAction(connection.id, !connection.isVisible)}
          undo={{ label: "Undo", problemAction: "connections.set_visibility", onRun: () => setConnectionVisibilityAction(connection.id, connection.isVisible) }}
        />
        <QuickActionButton
          label="Trash"
          accessibleLabel={`Move ${connection.fullName} to trash`}
          icon={Trash2}
          problemAction="trash.move_to_trash"
          onRun={() => moveToTrashAction(trashTarget)}
          undo={{ label: "Undo", problemAction: "trash.restore", onRun: () => restoreFromTrashAction(trashTarget) }}
        />
      </div>
    </li>
  );
}

export function ConnectionList({ connections }: { connections: ConnectionListItem[] }) {
  return (
    <ul className="border-b border-line">
      {connections.map((connection, index) => (
        <ConnectionRow key={connection.id} connection={connection} isFirst={index === 0} isLast={index === connections.length - 1} />
      ))}
    </ul>
  );
}
