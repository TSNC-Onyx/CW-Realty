import Link from "next/link";
import type { ReactNode } from "react";

// Style §11.5 buttons. One main button per section; labels start with a verb.

export type ButtonSize = "l" | "m" | "s";
export type ButtonVariant = "main" | "secondary";
export type Tone = "light" | "dark";

export type ButtonStyle = {
  size: ButtonSize;
  variant: ButtonVariant;
  tone?: Tone;
  isFullWidthOnMobile?: boolean;
};

const VARIANT_CLASSES: Record<Tone, Record<ButtonVariant, string>> = {
  light: { main: "btn-main", secondary: "btn-secondary" },
  dark: { main: "btn-main-gold", secondary: "btn-secondary-dark" },
};

export function getButtonClassName({ size, variant, tone = "light", isFullWidthOnMobile = false }: ButtonStyle): string {
  const widthClass = isFullWidthOnMobile ? "w-full md:w-auto" : "";
  return `btn btn-${size} ${VARIANT_CLASSES[tone][variant]} ${widthClass}`.trim();
}

type ButtonLinkProps = ButtonStyle & { href: string; children: ReactNode };

export function ButtonLink({ href, children, ...style }: ButtonLinkProps) {
  return (
    <Link href={href} className={getButtonClassName(style)}>
      {children}
    </Link>
  );
}
