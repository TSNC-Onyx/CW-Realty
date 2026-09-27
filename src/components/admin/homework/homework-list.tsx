"use client";

import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, FileText, FileVideoCamera, Pencil, Trash2, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { getButtonClassName } from "@/components/ui/button-link";
import { moveHomeworkItemAction, setHomeworkVisibilityAction } from "@/lib/admin/homework/actions";
import { moveToTrashAction, restoreFromTrashAction } from "@/lib/admin/trash/actions";
import type { HomeworkCover } from "@/lib/content/homework";
import type { HomeworkKind } from "@/lib/content/homework-rules";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Admin → Homework list (owner-approved design 2026-09-27): picture or file icon, title,
// type and size, captions warning, Shown/Hidden with an icon and the word, then the same
// actions as Team and Connections. Up and Down move an item within its own list.

const THUMBNAIL_SIZES = "96px";
const KIND_ICONS: Record<HomeworkKind, LucideIcon> = { video: FileVideoCamera, file: FileText, link: ExternalLink };

export type HomeworkListItem = {
  id: string;
  kind: HomeworkKind;
  title: string;
  detail: string;
  isVisible: boolean;
  needsCaptions: boolean;
  cover: HomeworkCover | null;
};

function ItemPicture({ item }: { item: HomeworkListItem }) {
  if (item.cover) {
    return (
      <div className="w-24 shrink-0">
        <ResponsivePhoto photo={item.cover} ratio="photo" sizes={THUMBNAIL_SIZES} />
      </div>
    );
  }
  const Icon = KIND_ICONS[item.kind];
  return (
    <span aria-hidden className="flex aspect-photo w-24 shrink-0 items-center justify-center border border-field-border bg-surface">
      <Icon size={ICON_SIZE.badge} />
    </span>
  );
}

function VisibilityStatus({ isVisible }: { isVisible: boolean }) {
  const Icon = isVisible ? Eye : EyeOff;
  return (
    <p className="type-small flex items-center gap-2">
      <Icon aria-hidden size={ICON_SIZE.inline} />
      {isVisible ? "Shown" : "Hidden"}
    </p>
  );
}

function CaptionsWarning() {
  return (
    <p className="mt-1 inline-flex items-center gap-1.5 border border-warning bg-warning-tint px-2 py-0.5 type-tag normal-case tracking-normal text-warning">
      <TriangleAlert aria-hidden size={ICON_SIZE.chevron} />
      No captions yet
    </p>
  );
}

function ItemRow({ item, isFirst, isLast }: { item: HomeworkListItem; isFirst: boolean; isLast: boolean }) {
  const trashTarget = { table: "homework_items" as const, id: item.id };
  return (
    <li className="grid gap-3 border-t border-line py-4 first:border-t-0 lg:grid-cols-12 lg:items-center">
      <div className="flex items-center gap-4 lg:col-span-4">
        <ItemPicture item={item} />
        <div>
          <p className="font-bold">{item.title}</p>
          <p className="type-small text-muted">{item.detail}</p>
          {item.needsCaptions && <CaptionsWarning />}
        </div>
      </div>
      <div className="lg:col-span-2">
        <VisibilityStatus isVisible={item.isVisible} />
      </div>
      <div className="flex flex-wrap gap-2 lg:col-span-6 lg:justify-end">
        <Link href={`/admin/homework/${item.id}`} className={`${getButtonClassName({ size: "s", variant: "main" })} px-3`}>
          <Pencil aria-hidden size={ICON_SIZE.button} />
          Edit
          <span className="sr-only">{item.title}</span>
        </Link>
        <QuickActionButton label="Up" accessibleLabel={`Move ${item.title} up`} icon={ArrowUp} isDisabled={isFirst} onRun={() => moveHomeworkItemAction(item.id, "up")} />
        <QuickActionButton label="Down" accessibleLabel={`Move ${item.title} down`} icon={ArrowDown} isDisabled={isLast} onRun={() => moveHomeworkItemAction(item.id, "down")} />
        <QuickActionButton
          label={item.isVisible ? "Hide" : "Show"}
          accessibleLabel={`${item.isVisible ? "Hide" : "Show"} ${item.title}`}
          icon={item.isVisible ? EyeOff : Eye}
          onRun={() => setHomeworkVisibilityAction(item.id, !item.isVisible)}
          undo={{ label: "Undo", onRun: () => setHomeworkVisibilityAction(item.id, item.isVisible) }}
        />
        <QuickActionButton
          label="Trash"
          accessibleLabel={`Move ${item.title} to trash`}
          icon={Trash2}
          onRun={() => moveToTrashAction(trashTarget)}
          undo={{ label: "Undo", onRun: () => restoreFromTrashAction(trashTarget) }}
        />
      </div>
    </li>
  );
}

export function HomeworkList({ items }: { items: HomeworkListItem[] }) {
  return (
    <ul className="border-t-2 border-b border-t-ink border-b-line">
      {items.map((item, index) => (
        <ItemRow key={item.id} item={item} isFirst={index === 0} isLast={index === items.length - 1} />
      ))}
    </ul>
  );
}
