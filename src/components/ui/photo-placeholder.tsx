import { ImageIcon } from "lucide-react";

import type { Tone } from "@/components/ui/button-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Style §11.8: reserved image space with the image-outline icon until a real photo exists.

export type PhotoRatio = "hero" | "photo" | "portrait";

const RATIO_CLASSES: Record<PhotoRatio, string> = {
  hero: "aspect-hero-mobile md:aspect-hero",
  photo: "aspect-photo",
  portrait: "aspect-portrait",
};

type PhotoPlaceholderProps = { ratio: PhotoRatio; tone?: Tone };

export function PhotoPlaceholder({ ratio, tone = "light" }: PhotoPlaceholderProps) {
  const toneClass = tone === "dark" ? "bg-photo-placeholder-dark text-on-dark-muted" : "bg-photo-placeholder text-muted";
  return (
    <div aria-hidden className={`flex w-full items-center justify-center ${RATIO_CLASSES[ratio]} ${toneClass}`}>
      <ImageIcon size={ICON_SIZE.message} />
    </div>
  );
}
