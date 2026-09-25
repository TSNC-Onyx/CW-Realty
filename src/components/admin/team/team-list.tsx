"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { getButtonClassName } from "@/components/ui/button-link";
import { moveTeamMemberAction, setTeamMemberVisibilityAction } from "@/lib/admin/team/actions";
import { moveToTrashAction, restoreFromTrashAction } from "@/lib/admin/trash/actions";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

export type TeamListItem = { id: string; fullName: string; jobTitle: string; isVisible: boolean; hasPhoto: boolean };

function TeamRow({ member, isFirst, isLast }: { member: TeamListItem; isFirst: boolean; isLast: boolean }) {
  const trashTarget = { table: "team_members" as const, id: member.id };
  return (
    <li className="grid gap-3 border-t border-line py-4 md:grid-cols-12 md:items-center">
      <div className="md:col-span-5">
        <p className="font-bold">{member.fullName}</p>
        <p className="type-small text-muted">
          {[member.jobTitle, member.isVisible ? "Shown" : "Hidden", member.hasPhoto ? null : "No photo"].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 md:col-span-7 md:justify-end">
        <Link href={`/admin/team/${member.id}`} className={`${getButtonClassName({ size: "s", variant: "main" })} px-3`}>
          <Pencil aria-hidden size={ICON_SIZE.button} />
          Edit
          <span className="sr-only">{member.fullName}</span>
        </Link>
        <QuickActionButton label="Up" accessibleLabel={`Move ${member.fullName} up`} icon={ArrowUp} isDisabled={isFirst} onRun={() => moveTeamMemberAction(member.id, "up")} />
        <QuickActionButton label="Down" accessibleLabel={`Move ${member.fullName} down`} icon={ArrowDown} isDisabled={isLast} onRun={() => moveTeamMemberAction(member.id, "down")} />
        <QuickActionButton
          label={member.isVisible ? "Hide" : "Show"}
          accessibleLabel={`${member.isVisible ? "Hide" : "Show"} ${member.fullName}`}
          icon={member.isVisible ? EyeOff : Eye}
          onRun={() => setTeamMemberVisibilityAction(member.id, !member.isVisible)}
          undo={{ label: "Undo", onRun: () => setTeamMemberVisibilityAction(member.id, member.isVisible) }}
        />
        <QuickActionButton
          label="Trash"
          accessibleLabel={`Move ${member.fullName} to trash`}
          icon={Trash2}
          onRun={() => moveToTrashAction(trashTarget)}
          undo={{ label: "Undo", onRun: () => restoreFromTrashAction(trashTarget) }}
        />
      </div>
    </li>
  );
}

export function TeamList({ members }: { members: TeamListItem[] }) {
  return (
    <ul className="border-b border-line">
      {members.map((member, index) => (
        <TeamRow key={member.id} member={member} isFirst={index === 0} isLast={index === members.length - 1} />
      ))}
    </ul>
  );
}
