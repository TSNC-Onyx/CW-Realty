import { ImageIcon } from "lucide-react";

import type { Tone } from "@/components/ui/button-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Style §11.8: reserved image space with the image-outline icon until a real photo exists.

export type PhotoRatio = "hero" | "photo" | "portrait";

/** rect is square-cornered (Style §11.3); arch rounds the top into a half circle (owner portrait only). */
export type PhotoShape = "rect" | "arch";

const RATIO_CLASSES: Record<PhotoRatio, string> = {
  hero: "aspect-hero-mobile md:aspect-hero",
  photo: "aspect-photo",
  portrait: "aspect-portrait",
};

export const SHAPE_CLASSES: Record<PhotoShape, string> = { rect: "", arch: "photo-arch" };

type PhotoPlaceholderProps = { ratio: PhotoRatio; tone?: Tone; shape?: PhotoShape };

export function PhotoPlaceholder({ ratio, tone = "light", shape = "rect" }: PhotoPlaceholderProps) {
  const toneClass = tone === "dark" ? "bg-photo-placeholder-dark text-on-dark-muted" : "bg-photo-placeholder text-muted";
  return (
    <div aria-hidden className={`flex w-full items-center justify-center ${RATIO_CLASSES[ratio]} ${SHAPE_CLASSES[shape]} ${toneClass}`}>
      <ImageIcon size={ICON_SIZE.message} />
    </div>
  );
}
