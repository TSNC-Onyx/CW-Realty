import Link from "next/link";

// Style §11.7: full round CWR mark with a 2px gold ring, never recolored; links home
// (the admin dashboard inside the portal) with alt "CWR Real Estate".
// A plain <img> is used because next/image writes inline styles the strict CSP blocks.

export type LogoPlacement = "header" | "footer";

const HOME_PATH = "/";
const LOGO_SOURCE = "/brand/cwr-logo-176.webp";

const PLACEMENTS: Record<LogoPlacement, { pixelSize: number; sizeClass: string }> = {
  header: { pixelSize: 75, sizeClass: "size-13.75 lg:size-18.75" },
  footer: { pixelSize: 88, sizeClass: "size-18 lg:size-22" },
};

type LogoProps = { placement: LogoPlacement; href?: string; onNavigate?: () => void };

export function Logo({ placement, href = HOME_PATH, onNavigate }: LogoProps) {
  const { pixelSize, sizeClass } = PLACEMENTS[placement];
  return (
    <Link href={href} onClick={onNavigate} className={`logo-mark ${sizeClass}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- see note above */}
      <img src={LOGO_SOURCE} alt="CWR Real Estate" width={pixelSize} height={pixelSize} />
    </Link>
  );
}
