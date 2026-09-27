import type { AdminConnection } from "@/lib/admin/connections/queries";
import type { ConnectionPhoto } from "@/lib/content/connections";

/** The stored photo of an admin connection row, or null when it has none. */
export function getConnectionPhoto(connection: AdminConnection): ConnectionPhoto | null {
  const { photo_path, photo_alt, photo_width, photo_height } = connection;
  if (!photo_path || !photo_alt || !photo_width || !photo_height) return null;
  return { folder: photo_path, alt: photo_alt, width: photo_width, height: photo_height };
}
