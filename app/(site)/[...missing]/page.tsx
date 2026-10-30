import type { Metadata } from "next";
import { notFound } from "next/navigation";

// Any unknown public URL shows the site's own 404 page inside the site layout.

// Since Next.js 16.4 the 404 page's own title was replaced by the site default after load
// (finding F2); the route that answers the unknown URL now names the same title itself.
export async function generateMetadata(): Promise<Metadata> {
  return { title: "Page not found", robots: { index: false } };
}

export default function MissingPage() {
  notFound();
}
