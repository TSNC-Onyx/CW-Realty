import type { ReactNode } from "react";

import { Eyebrow } from "@/components/ui/eyebrow";
import { Container } from "@/components/ui/section";

type PageIntroProps = { eyebrow: string; title: string; lead: string; children?: ReactNode };

// Top of every inner page: eyebrow, the page's one H1, and a lead paragraph.
export function PageIntro({ eyebrow, title, lead, children }: PageIntroProps) {
  return (
    <div className="bg-page pt-12 pb-6 lg:pt-24 lg:pb-10">
      <Container>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="type-h1 max-w-prose">{title}</h1>
        <p className="type-lead mt-4 max-w-prose">{lead}</p>
        {children}
      </Container>
    </div>
  );
}
