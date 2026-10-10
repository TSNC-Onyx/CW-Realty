import { ButtonLink } from "@/components/ui/button-link";

// Shown, never recorded: Next.js builds this screen into every render, so the page that
// found nothing records the miss instead (src/lib/admin/record-page-not-found.ts).
export default function AdminNotFound() {
  return (
    <>
      <h1 className="type-h1 mb-4">That page isn&apos;t here</h1>
      <p className="mb-6 max-w-prose">It may have been moved to the trash, or the link is out of date.</p>
      <ButtonLink href="/admin" size="m" variant="main">Go to the dashboard</ButtonLink>
    </>
  );
}
