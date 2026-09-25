import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Charlie Ward Realty",
  description: "Charlie Ward Realty — Greensboro and the Triad, North Carolina.",
};

// The strict CSP uses a per-request nonce, which requires dynamic rendering.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
