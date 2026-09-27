"use client";

import { ImageOff } from "lucide-react";

import { PhotoPicker } from "@/components/admin/photos/photo-picker";
import { QuickActionButton } from "@/components/admin/quick-action-button";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { removeConnectionPhotoAction, setConnectionPhotoAction } from "@/lib/admin/connections/actions";
import type { ConnectionPhoto as Photo } from "@/lib/content/connections";

type ConnectionPhotoProps = { connectionId: string; fullName: string; photo: Photo | null };

export function ConnectionPhoto({ connectionId, fullName, photo }: ConnectionPhotoProps) {
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
            onRun={() => removeConnectionPhotoAction(connectionId)}
            undo={{ label: "Undo", onRun: () => setConnectionPhotoAction({ connectionId, ...photo }) }}
          />
        </div>
      )}
      <PhotoPicker
        target={{ kind: "connection", recordId: connectionId }}
        buttonLabel={photo ? "Replace photo" : "Add photo"}
        onUploaded={(uploaded, alt) => setConnectionPhotoAction({ connectionId, ...uploaded, alt })}
      />
      <p className="type-small max-w-prose text-muted">A portrait works best, at least 800 × 1000 pixels. It is cropped to fit.</p>
    </div>
  );
}
