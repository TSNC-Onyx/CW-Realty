import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ICON_SIZE } from "@/lib/design/icon-sizes";

type TextLinkProps = { href: string; children: ReactNode; hasArrow?: boolean };

// Style §11.5 text link: underlined, 600 weight, 44px tall, optional 18px arrow.
export function TextLink({ href, children, hasArrow = false }: TextLinkProps) {
  return (
    <Link href={href} className="text-link">
      {children}
      {hasArrow && <ArrowRight aria-hidden size={ICON_SIZE.inline} />}
    </Link>
  );
}
