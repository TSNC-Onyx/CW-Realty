import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";

import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Previous / Next paging for long lists (Infra §5). Page 1 has no ?page= in its URL.

type PaginationProps = { basePath: string; currentPage: number; totalPages: number };

function getPageHref(basePath: string, page: number): string {
  if (page === 1) return basePath;
  return `${basePath}${basePath.includes("?") ? "&" : "?"}page=${page}`;
}

export function Pagination({ basePath, currentPage, totalPages }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-12 flex items-center justify-between gap-4 border-t border-line pt-6">
      {currentPage > 1 ? (
        <Link href={getPageHref(basePath, currentPage - 1)} className="text-link">
          <ArrowLeft aria-hidden size={ICON_SIZE.inline} />
          Previous page
        </Link>
      ) : (
        <span />
      )}
      <p className="type-small text-muted">{`Page ${currentPage} of ${totalPages}`}</p>
      {currentPage < totalPages ? (
        <Link href={getPageHref(basePath, currentPage + 1)} className="text-link">
          Next page
          <ArrowRight aria-hidden size={ICON_SIZE.inline} />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
