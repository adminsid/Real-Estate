import { resolveMediaUrl } from '@/utils/media'

interface ListingMediaItem {
  mediaUrl?: string | null
}

interface ListingMediaSource {
  id?: string | null
  heroMediaUrl?: string | null
  media?: ListingMediaItem[] | null
}

/** Returns the canonical, display-ready listing photos without legacy-field fallbacks. */
export function getListingPhotoUrls(listing: ListingMediaSource | null | undefined): string[] {
  if (!listing) return []

  const rawUrls = [
    listing.heroMediaUrl,
    ...(Array.isArray(listing.media) ? listing.media.map((item) => item?.mediaUrl) : []),
  ]

  return Array.from(
    new Set(
      rawUrls
        .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
        .map((url) => resolveMediaUrl(url, listing.id)),
    ),
  )
}
