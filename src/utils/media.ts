/**
 * resolveMediaUrl
 * Converts any media reference (full URL, relative /api/media/, or raw filename)
 * into a fully-qualified valid URL pointing to the media CDN/proxy.
 */
export function resolveMediaUrl(url?: string | null, listingId?: string | null): string {
  if (!url || typeof url !== 'string' || !url.trim()) return ''
  const trimmed = url.trim()
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed
  }

  // Handle leading /api/media/ or other absolute paths
  if (trimmed.startsWith('/api/media/')) {
    return `https://inventory.primeamericarealestate.com${trimmed}`
  }
  if (trimmed.startsWith('/')) {
    return `https://inventory.primeamericarealestate.com${trimmed}`
  }

  // Handle raw UUID filenames like "bf9dfe2a-46a9-4d2f-a0e3-baac28ecf75f-1.jpeg"
  if (listingId) {
    return `https://inventory.primeamericarealestate.com/api/media/${listingId}/${trimmed}`
  }
  return `https://inventory.primeamericarealestate.com/api/media/${trimmed}`
}
