"use client";

import { useState } from "react";

import { AdminTwoColumn } from "@/components/admin/admin-two-column";
import type { ConnectionDefaults } from "@/components/admin/connections/connection-fields";
import { ConnectionForm } from "@/components/admin/connections/connection-form";
import { ConnectionPhoto } from "@/components/admin/connections/connection-photo";
import { ConnectionPreview, type ConnectionPreviewValues } from "@/components/admin/connections/connection-preview";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import type { ConnectionPhoto as Photo } from "@/lib/content/connections";

// Edit connection (docs/admin-upload-layout-plan.md): details on the left; the photo and a
// live preview on the right. The photo has its own buttons, so it sits outside the details form.

type ConnectionEditorProps = { connectionId: string; defaults: ConnectionDefaults; photo: Photo | null };

export function ConnectionEditor({ connectionId, defaults, photo }: ConnectionEditorProps) {
  const [previewValues, setPreviewValues] = useState<ConnectionPreviewValues>(defaults);
  return (
    <AdminTwoColumn
      sideLabel="Photo and preview"
      main={<ConnectionForm connectionId={connectionId} defaults={defaults} onPreviewChange={setPreviewValues} />}
      side={
        <>
          <section aria-labelledby="photo-heading" className="grid gap-4 border-t-2 border-ink pt-6">
            <h2 id="photo-heading" className="type-h3">
              Photo
            </h2>
            <ConnectionPhoto connectionId={connectionId} fullName={defaults.fullName} photo={photo} />
          </section>
          <ConnectionPreview values={previewValues} photo={<ResponsivePhoto photo={photo} ratio="portrait" sizes="112px" />} />
        </>
      }
    />
  );
}
