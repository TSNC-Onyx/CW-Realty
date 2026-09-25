import { notFound } from "next/navigation";

// Unknown admin URLs show the admin "not found" page inside the portal frame.
export default function MissingAdminPage() {
  notFound();
}
