import { describe, expect, it } from 'vitest'
import { getListingPhotoUrls } from '../listingMedia'

describe('getListingPhotoUrls', () => {
  it('uses canonical hero and media fields, resolves paths, and removes duplicates', () => {
    expect(getListingPhotoUrls({
      id: 'listing-a',
      heroMediaUrl: '/api/media/listing-a/hero.jpg',
      media: [
        { mediaUrl: '/api/media/listing-a/hero.jpg' },
        { mediaUrl: 'kitchen.jpg' },
        { mediaUrl: 'https://cdn.example.com/bath.jpg' },
      ],
    })).toEqual([
      'https://inventory.primeamericarealestate.com/api/media/listing-a/hero.jpg',
      'https://inventory.primeamericarealestate.com/api/media/listing-a/kitchen.jpg',
      'https://cdn.example.com/bath.jpg',
    ])
  })

  it('does not invent an unrelated stock image when the listing has no media', () => {
    expect(getListingPhotoUrls({ id: 'listing-a' })).toEqual([])
  })
})
