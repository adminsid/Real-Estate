export type ListingPrintLayout = 'one-page' | 'two-page'

const ONE_PAGE_DESCRIPTION_LIMIT = 700
const ONE_PAGE_PHOTO_LIMIT = 4

export function selectListingPrintLayout(description: string, photoCount: number): ListingPrintLayout {
  const normalizedLength = description.trim().replace(/\s+/g, ' ').length
  return normalizedLength <= ONE_PAGE_DESCRIPTION_LIMIT && photoCount <= ONE_PAGE_PHOTO_LIMIT
    ? 'one-page'
    : 'two-page'
}

export function createPrintExcerpt(description: string, limit = 360): string {
  const normalized = description.trim().replace(/\s+/g, ' ')
  if (normalized.length <= limit) return normalized

  const candidate = normalized.slice(0, limit + 1)
  const sentenceEnd = Math.max(
    candidate.lastIndexOf('. '),
    candidate.lastIndexOf('! '),
    candidate.lastIndexOf('? '),
  )
  if (sentenceEnd >= Math.floor(limit * 0.55)) return candidate.slice(0, sentenceEnd + 1)

  const wordEnd = candidate.lastIndexOf(' ')
  return `${candidate.slice(0, wordEnd > 0 ? wordEnd : limit).trimEnd()}…`
}
