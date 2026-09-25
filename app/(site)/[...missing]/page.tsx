import { notFound } from "next/navigation";

// Any unknown public URL shows the site's own 404 page inside the site layout.
export default function MissingPage() {
  notFound();
}
