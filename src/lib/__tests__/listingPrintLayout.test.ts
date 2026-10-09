import { describe, expect, it } from 'vitest'
import { createPrintExcerpt, selectListingPrintLayout } from '../listingPrintLayout'

describe('listing print layout', () => {
  it('keeps concise listings with a small gallery on one page', () => {
    expect(selectListingPrintLayout('Bright two-bedroom home near transit.', 4)).toBe('one-page')
  })

  it('uses an intentional second page for long descriptions', () => {
    expect(selectListingPrintLayout('A'.repeat(701), 3)).toBe('two-page')
  })

  it('uses a visual cover when the listing has a larger photo set', () => {
    expect(selectListingPrintLayout('Concise description.', 6)).toBe('two-page')
  })

  it('creates an exact, sentence-aware excerpt without rewriting the listing', () => {
    const description = `${'A'.repeat(210)}. ${'B'.repeat(210)}. ${'C'.repeat(210)}.`
    const excerpt = createPrintExcerpt(description, 360)
    expect(excerpt).toBe(`${'A'.repeat(210)}.`)
  })
})
