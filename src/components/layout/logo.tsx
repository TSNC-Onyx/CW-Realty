import Link from "next/link";

// Style §11.7: full round CWR mark, never recolored; links home with alt "CWR Real Estate".
// A plain <img> is used because next/image writes inline styles the strict CSP blocks.

export type LogoPlacement = "header" | "footer";

const PLACEMENTS: Record<LogoPlacement, { src: string; pixelSize: number; sizeClass: string }> = {
  header: { src: "/brand/cwr-logo-120.webp", pixelSize: 60, sizeClass: "size-11 lg:size-15" },
  footer: { src: "/brand/cwr-logo-176.webp", pixelSize: 88, sizeClass: "size-18 lg:size-22" },
};

type LogoProps = { placement: LogoPlacement; onNavigate?: () => void };

export function Logo({ placement, onNavigate }: LogoProps) {
  const { src, pixelSize, sizeClass } = PLACEMENTS[placement];
  return (
    <Link href="/" onClick={onNavigate} className="inline-flex shrink-0 rounded-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- see note above */}
      <img src={src} alt="CWR Real Estate" width={pixelSize} height={pixelSize} className={`rounded-full ${sizeClass}`} />
    </Link>
  );
}
