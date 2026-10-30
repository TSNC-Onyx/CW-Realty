import Link from "next/link";
import type { ComponentProps } from "react";

import { isExternalHref } from "@/lib/site/navigation";

// One link for the header menu, phone menu, and footer. A link that leaves the site (623 Summit)
// opens in a new tab and says so to screen readers, like the admin's "View website" link.

type MenuLinkProps = Omit<ComponentProps<typeof Link>, "href" | "target" | "rel"> & { href: string };

export function MenuLink({ href, children, ...props }: MenuLinkProps) {
  if (!isExternalHref(href)) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </Link>
  );
}
