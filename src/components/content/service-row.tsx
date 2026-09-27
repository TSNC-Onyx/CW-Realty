import { Check } from "lucide-react";

import { SitePhotoImage } from "@/components/content/responsive-photo";
import type { Tone } from "@/components/ui/button-link";
import type { SitePhoto } from "@/lib/content/site-photos";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// A service with its photo beside the heading, summary, and points (owner-approved
// Property Management layout, 2026-09-26). Desktop and tablet place the photo on the
// given side; phones always show the photo first.

const PHOTO_SIZES = "(min-width: 1024px) 624px, (min-width: 768px) 50vw, 100vw";

export type PhotoSide = "left" | "right";

export type Service = { title: string; summary: string; points: string[]; photo: SitePhoto };

type ServiceRowProps = { service: Service; photoSide: PhotoSide; tone: Tone };

export function ServiceRow({ service, photoSide, tone }: ServiceRowProps) {
  const photoOrderClass = photoSide === "right" ? "md:order-2" : "";
  const checkClass = tone === "dark" ? "text-gold" : "text-ink";
  return (
    <li className="grid items-center gap-6 py-10 md:grid-cols-2 md:gap-16 lg:py-12">
      <div className={photoOrderClass}>
        <SitePhotoImage photo={service.photo} sizes={PHOTO_SIZES} />
      </div>
      <div>
        <h3 className="type-h3">{service.title}</h3>
        <p className="mt-2 text-md font-bold">{service.summary}</p>
        <ul className="mt-6 grid gap-3">
          {service.points.map((point) => (
            <li key={point} className="flex gap-3">
              <Check aria-hidden size={ICON_SIZE.inline} className={`mt-1.5 shrink-0 ${checkClass}`} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
