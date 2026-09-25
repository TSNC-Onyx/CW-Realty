import type { Metadata } from "next";
import { connection } from "next/server";

import { FONT_VARIABLE_CLASSES } from "@/lib/design/fonts";
import { SITE_URL } from "@/lib/site/navigation";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Charlie Ward Realty", template: "%s | Charlie Ward Realty" },
  description: "Charlie Ward Realty — Greensboro and the Triad, North Carolina.",
};

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
