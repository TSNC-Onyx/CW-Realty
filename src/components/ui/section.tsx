import type { ReactNode } from "react";

// Style §11.4: 96px section padding on desktop, 48px on mobile; 64/32/16px side margins.
// A follow-on section continues a same-color section above it, so its top padding is the
// intro gap (24/40px) instead of a second full padding; its scroll margin keeps anchor jumps
// landing 48/96px below the header (docs/cwr-selected-services-spacing-plan.md).

export type SectionTone = "page" | "soft" | "dark" | "texture";

const TONE_CLASSES: Record<SectionTone, string> = {
  page: "bg-page",
  soft: "bg-surface-soft",
  dark: "tone-dark",
  texture: "tone-texture",
};

const FULL_PADDING_CLASSES = "py-12 lg:py-24";
const FOLLOW_ON_PADDING_CLASSES = "pt-6 pb-12 scroll-mt-6 lg:pt-10 lg:pb-24 lg:scroll-mt-14";

type ContainerProps = { children: ReactNode; className?: string };

export function Container({ children, className = "" }: ContainerProps) {
  return <div className={`mx-auto w-full max-w-content px-4 md:px-8 lg:px-16 ${className}`}>{children}</div>;
}

type SectionProps = { tone?: SectionTone; labelledBy?: string; id?: string; isFollowOn?: boolean; children: ReactNode };

export function Section({ tone = "page", labelledBy, id, isFollowOn = false, children }: SectionProps) {
  const paddingClasses = isFollowOn ? FOLLOW_ON_PADDING_CLASSES : FULL_PADDING_CLASSES;
  return (
    <section id={id} aria-labelledby={labelledBy} className={`${TONE_CLASSES[tone]} ${paddingClasses}`}>
      <Container>{children}</Container>
    </section>
  );
}
