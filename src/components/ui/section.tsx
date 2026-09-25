import type { ReactNode } from "react";

// Style §11.4: 96px section padding on desktop, 48px on mobile; 64/32/16px side margins.

export type SectionTone = "page" | "soft" | "dark";

const TONE_CLASSES: Record<SectionTone, string> = {
  page: "bg-page",
  soft: "bg-surface-soft",
  dark: "tone-dark",
};

type ContainerProps = { children: ReactNode; className?: string };

export function Container({ children, className = "" }: ContainerProps) {
  return <div className={`mx-auto w-full max-w-content px-4 md:px-8 lg:px-16 ${className}`}>{children}</div>;
}

type SectionProps = { tone?: SectionTone; labelledBy?: string; id?: string; children: ReactNode };

export function Section({ tone = "page", labelledBy, id, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`${TONE_CLASSES[tone]} py-12 lg:py-24`}>
      <Container>{children}</Container>
    </section>
  );
}
