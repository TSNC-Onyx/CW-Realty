import type { Metadata } from "next";

// The admin portal is private: never indexed, never in the sitemap.
export const metadata: Metadata = {
  title: { default: "CWR admin", template: "%s | CWR admin" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
