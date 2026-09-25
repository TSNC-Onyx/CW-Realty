"use client";

import { ImageOff } from "lucide-react";

import { PhotoPicker } from "@/components/admin/photos/photo-picker";
import { QuickActionButton } from "@/components/admin/quick-action-button";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { removeTeamPhotoAction, setTeamPhotoAction } from "@/lib/admin/team/actions";

type TeamPhotoProps = {
  memberId: string;
  fullName: string;
  photo: { folder: string; alt: string; width: number; height: number } | null;
};

export function TeamPhoto({ memberId, fullName, photo }: TeamPhotoProps) {
  return (
    <div className="grid gap-4">
      <div className="w-48">
        <ResponsivePhoto photo={photo} ratio="portrait" sizes="192px" />
      </div>
      {photo && (
        <div>
          <QuickActionButton
            label="Remove photo"
            accessibleLabel={`Remove ${fullName}'s photo`}
            icon={ImageOff}
            onRun={() => removeTeamPhotoAction(memberId)}
            undo={{ label: "Undo", onRun: () => setTeamPhotoAction({ memberId, ...photo }) }}
          />
        </div>
      )}
      <PhotoPicker
        target={{ kind: "team", recordId: memberId }}
        buttonLabel={photo ? "Replace photo" : "Add photo"}
        onUploaded={(uploaded, alt) => setTeamPhotoAction({ memberId, ...uploaded, alt })}
      />
    </div>
  );
}
