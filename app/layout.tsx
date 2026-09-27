import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";

import { FONT_VARIABLE_CLASSES } from "@/lib/design/fonts";
import { SITE_URL } from "@/lib/site/navigation";
import { getShareMetadata } from "@/lib/site/share-image";

import "./globals.css";

// Link previews use the share image on the host that was asked for (src/lib/site/share-image.ts).
export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: "Charlie Ward Realty", template: "%s | Charlie Ward Realty" },
    description: "Charlie Ward Realty — Greensboro and the Triad, North Carolina.",
    ...getShareMetadata(headerStore.get("host")),
  };
}

// The strict CSP uses a per-request nonce, which requires dynamic rendering.
// Public pages add their layout in app/(site); the admin portal in app/admin.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="en" className={FONT_VARIABLE_CLASSES}>
      <body>{children}</body>
    </html>
  );
}
