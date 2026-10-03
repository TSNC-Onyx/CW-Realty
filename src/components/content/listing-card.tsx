import { Images } from "lucide-react";
import Link from "next/link";

import { ListingFacts } from "@/components/content/listing-facts";
import { ResponsivePhoto } from "@/components/content/responsive-photo";
import { StatusTag } from "@/components/content/status-tag";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { getDisplayPrice } from "@/lib/content/format";
import type { Listing } from "@/lib/content/listings";

// Style §11.10 listing card: no box, 2px ink top rule, 3:2 photo with status tag,
// price, address, city, details; the whole card is one link; hover zooms the photo. With more
// than one photo, a "8 photos" label says there are more to see on the listing (decision D1).

const CARD_PHOTO_SIZES = "(min-width: 1024px) 400px, (min-width: 768px) 50vw, 100vw";

export function ListingCard({ listing, isPriority = false }: { listing: Listing; isPriority?: boolean }) {
  return (
    <Link href={`/listings/${listing.slug}`} className="group block border-t-2 border-ink">
      <div className="relative overflow-hidden">
        <StatusTag status={listing.status} isOverlay />
        {listing.photos.length > 1 && (
          <span className="tone-dark type-tag absolute right-3 bottom-3 z-10 inline-flex items-center gap-2 px-2.5 py-1.5">
            <Images aria-hidden size={ICON_SIZE.chevron} />
            {`${listing.photos.length} photos`}
          </span>
        )}
        <ResponsivePhoto
          photo={listing.photos[0] ?? null}
          ratio="photo"
          sizes={CARD_PHOTO_SIZES}
          isPriority={isPriority}
          imageClassName="transition-transform duration-200 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <p className="type-price mt-4">{getDisplayPrice(listing.priceCents)}</p>
      <p className="mt-1 text-md font-semibold underline-offset-4 group-hover:underline">{listing.streetAddress}</p>
      <p className="mb-2 text-md text-muted">{listing.cityLine}</p>
      <ListingFacts bedrooms={listing.bedrooms} bathrooms={listing.bathrooms} squareFeet={listing.squareFeet} />
    </Link>
  );
}
