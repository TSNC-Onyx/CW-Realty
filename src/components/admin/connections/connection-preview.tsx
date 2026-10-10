import { Globe, Mail, Phone, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { ConnectionDefaults } from "@/components/admin/connections/connection-fields";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// How the partner will look on the Connections page, following what is typed
// (owner-approved prototype 2026-10-10, docs/admin-upload-layout-plan.md).

export type ConnectionPreviewValues = Omit<ConnectionDefaults, "isVisible">;

/** The partner details currently typed in a connection form. */
export function getConnectionPreviewValues(form: HTMLFormElement): ConnectionPreviewValues {
  const formData = new FormData(form);
  const getText = (name: keyof ConnectionPreviewValues) => String(formData.get(name) ?? "").trim();
  return { fullName: getText("fullName"), category: getText("category"), titleLine: getText("titleLine"), phone: getText("phone"), email: getText("email"), website: getText("website") };
}

function PreviewLine({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold break-words">
      <Icon aria-hidden size={ICON_SIZE.inline} className="shrink-0" />
      {text}
    </p>
  );
}

export function ConnectionPreview({ values, photo }: { values: ConnectionPreviewValues; photo: ReactNode }) {
  const name = values.fullName || "Full name";
  return (
    <section aria-labelledby="connection-preview-heading" className="grid gap-3 border-t-2 border-ink pt-6">
      <h2 id="connection-preview-heading" className="type-h3">
        Preview
      </h2>
      <p className="type-small text-muted">How the partner looks on the Connections page.</p>
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-4 border border-line bg-surface p-4">
        <div>{photo}</div>
        <div className="grid min-w-0 gap-1">
          <p className="type-small font-semibold text-muted">{values.category}</p>
          <p className="font-display text-xl font-semibold break-words">{name}</p>
          {values.titleLine && <p className="text-sm text-muted">{values.titleLine}</p>}
          {values.phone && <PreviewLine icon={Phone} text={`Call ${values.phone}`} />}
          {values.email && <PreviewLine icon={Mail} text={`Email ${name}`} />}
          {values.website && <PreviewLine icon={Globe} text={`Visit ${name}'s website`} />}
        </div>
      </div>
    </section>
  );
}
